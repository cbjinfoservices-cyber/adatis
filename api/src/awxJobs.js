const { q } = require('./db');
const awx = require('./awx');
const awxRbac = require('./awxRbac');
const { revealSecrets } = require('./secrets');
const { authMode, ensureAccessToken } = require('./auth');

/**
 * Exécution des demandes par AWX.
 *
 * Principe : le job template est lancé avec le jeton OAuth de l'utilisateur
 * connecté. Le portail ne dispose donc que des droits AWX de cette personne,
 * et jamais d'un compte de service partagé.
 */

const TERMINAL_AWX = ['success', 'failed', 'canceled'];

/**
 * Modèle à lancer pour un service.
 * Priorité : workflow template du service, puis job template du service,
 * puis repli global AWX_JOB_TEMPLATE_ID.
 */
const templateForService = (service) => {
  const workflowId = Number(service?.awx_workflow_job_template_id);
  if (Number.isInteger(workflowId) && workflowId > 0) {
    return {
      kind: 'workflow',
      id: workflowId,
      name: String(service?.awx_workflow_job_template_name || '').trim(),
    };
  }

  const own = Number(service?.awx_job_template_id);
  if (Number.isInteger(own) && own > 0) {
    return { kind: 'job', id: own, name: String(service?.awx_job_template_name || '').trim() };
  }

  const fallback = Number(process.env.AWX_JOB_TEMPLATE_ID);
  if (Number.isInteger(fallback) && fallback > 0) {
    return { kind: 'job', id: fallback, name: String(process.env.AWX_JOB_TEMPLATE_NAME || '').trim() };
  }
  return null;
};

const templateIdForService = (service) => templateForService(service)?.id || null;

const templateNameForService = (service) => templateForService(service)?.name || '';

const buildExtraVars = ({
  requestId, service, environment, payload, user,
}) => ({
  portal_request_id: requestId,
  portal_service_id: service?.id || '',
  portal_service_name: String(service?.name_fr || service?.name_en || ''),
  portal_environment: environment || '',
  portal_user: user?.awxUsername || user?.name || '',
  portal_user_email: user?.email || '',
  // Seul endroit où les champs secrets sont déchiffrés.
  portal_request_payload: revealSecrets(payload),
});

const saveJob = async ({
  requestId, jobId, jobUrl, kind, templateId, templateName, awxStatus, launchedBy,
}) => {
  await q(
    `UPDATE requests
        SET awx_job_id = $2,
            awx_job_url = $3,
            awx_job_kind = $4,
            awx_job_template_id = $5,
            awx_job_template_name = $6,
            awx_status = $7,
            awx_started_at = now(),
            awx_launched_by = $8
      WHERE id = $1`,
    [
      requestId,
      jobId,
      jobUrl,
      kind === 'workflow' ? 'workflow' : 'job',
      templateId,
      String(templateName || '').slice(0, 200),
      String(awxStatus || '').slice(0, 40),
      String(launchedBy || '').slice(0, 120),
    ],
  );
};

const markFailed = async (requestId, reason) => {
  await q(
    `UPDATE requests SET awx_status = $2 WHERE id = $1`,
    [requestId, String(reason || 'launch_failed').slice(0, 200)],
  ).catch(() => {});
};

/**
 * Lance le job template du service pour une demande.
 * Ne jette jamais : le retour décrit ce qui s'est passé pour l'interface.
 */
const launchForRequest = async ({
  request, service, session, user,
}) => {
  if (authMode() !== 'awx') return { skipped: 'auth_disabled' };
  if (!session) return { skipped: 'no_session' };

  const template = templateForService(service);
  if (!template) return { skipped: 'no_template' };

  const token = await ensureAccessToken(session);
  if (!token) {
    await markFailed(request.id, 'no_awx_token');
    return { skipped: 'no_token' };
  }

  // RBAC AWX : on refuse un modèle que l'utilisateur n'a pas le droit de lancer.
  const access = await awxRbac.accessForSession(session);
  if (!awxRbac.allowed(access, template.kind, template.id)) {
    await markFailed(request.id, 'rbac_forbidden');
    return { skipped: 'rbac_forbidden' };
  }

  try {
    const extraVars = buildExtraVars({
      requestId: request.id,
      service,
      environment: request.environment,
      payload: request.payload,
      user,
    });

    const launched = template.kind === 'workflow'
      ? await awx.launchWorkflowTemplate({ templateId: template.id, accessToken: token, extraVars })
      : await awx.launchJobTemplate({ templateId: template.id, accessToken: token, extraVars });

    const jobId = template.kind === 'workflow' ? launched.workflowJobId : launched.jobId;
    const jobUrl = template.kind === 'workflow' ? awx.workflowJobUrl(jobId) : awx.jobUrl(jobId);

    await saveJob({
      requestId: request.id,
      jobId,
      jobUrl,
      kind: template.kind,
      templateId: template.id,
      templateName: template.name,
      awxStatus: launched.status,
      launchedBy: user?.awxUsername || user?.name || '',
    });

    return {
      jobId,
      jobUrl,
      kind: template.kind,
      templateId: template.id,
      templateName: template.name,
      status: launched.status,
      launchedBy: user?.awxUsername || user?.name || '',
    };
  } catch (err) {
    console.error('[awx] lancement impossible :', err.message);
    await markFailed(request.id, `launch_error: ${err.message}`.slice(0, 200));
    return { error: err.message };
  }
};

/** Recalcule l'état d'un job existant et aligne la demande du portail. */
const syncRequest = async ({ request, session }) => {
  if (!request?.awx_job_id || !session) return null;
  const token = await ensureAccessToken(session);
  if (!token) return null;

  const kind = request.awx_job_kind === 'workflow' ? 'workflow' : 'job';

  try {
    const job = kind === 'workflow'
      ? await awx.fetchWorkflowJob(request.awx_job_id, token)
      : await awx.fetchJob(request.awx_job_id, token);
    const mapped = awx.portalStatus(job.status);
    const progress = mapped === 'success' ? 100 : mapped === 'running' ? 60 : null;

    await q(
      `UPDATE requests
          SET awx_status = $2,
              status = COALESCE($3, status),
              progress = COALESCE($4, progress),
              duration_sec = CASE WHEN $5 > 0 THEN $5 ELSE duration_sec END
        WHERE id = $1`,
      [
        request.id,
        job.status.slice(0, 40),
        mapped && ['queued', 'running', 'success', 'failed', 'canceled'].includes(mapped) ? mapped : null,
        progress,
        Math.round(job.elapsed || 0),
      ],
    );

    return {
      jobId: job.jobId,
      jobUrl: kind === 'workflow' ? awx.workflowJobUrl(job.jobId) : awx.jobUrl(job.jobId),
      kind,
      status: job.status,
      portalStatus: mapped,
      elapsed: job.elapsed,
      templateId: job.templateId,
      templateName: job.templateName,
    };
  } catch (err) {
    console.error('[awx] synchronisation du job impossible :', err.message);
    return null;
  }
};

const isTerminal = (status) => TERMINAL_AWX.includes(status);

module.exports = {
  templateForService,
  templateIdForService,
  templateNameForService,
  launchForRequest,
  syncRequest,
  isTerminal,
};