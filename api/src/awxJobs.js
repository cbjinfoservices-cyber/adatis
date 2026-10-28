const { q } = require('./db');
const awx = require('./awx');
const awxRbac = require('./awxRbac');
const { revealSecrets } = require('./secrets');
const { authMode, ensureAccessToken, latestSessionForUser } = require('./auth');
const { sendEmail, emailConfigured } = require('./mailer');

/**
 * Exécution des demandes par AWX.
 *
 * Principe : le job template est lancé avec le jeton OAuth de l'utilisateur
 * connecté. Le portail ne dispose donc que des droits AWX de cette personne,
 * et jamais d'un compte de service partagé. L'état du job est ensuite relu
 * avec le jeton de ce même lanceur (tâche de fond, voir jobMonitor.js).
 */

const TERMINAL_PORTAL = ['success', 'failed', 'canceled'];
const ACTIVE_AWX = ['new', 'pending', 'waiting', 'running'];

/** Motif d'échec affiché quand Ascender n'a pas pu lancer le job. */
const LAUNCH_FAILED = 'launch_failed';

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

/** Nouvelle ligne d'historique : une par lancement, réussi ou non. */
const recordAttempt = (requestId, {
  jobId = null, kind, templateId, templateName, status, error = '', launchedBy,
}) => q(
  `INSERT INTO job_attempts (request_id, attempt, awx_job_id, kind, template_id, template_name,
                             status, error, launched_by)
   SELECT $1, COALESCE(max(attempt), 0) + 1, $2, $3, $4, $5, $6, $7, $8
     FROM job_attempts WHERE request_id = $1`,
  [
    requestId,
    jobId,
    kind === 'workflow' ? 'workflow' : 'job',
    templateId || null,
    String(templateName || '').slice(0, 200),
    String(status || '').slice(0, 40),
    String(error || '').slice(0, 300),
    String(launchedBy || '').slice(0, 120),
  ],
);

/** Job lancé : il devient le job courant de la demande, qui repart de zéro. */
const saveJob = async ({
  requestId, jobId, jobUrl, kind, templateId, templateName, awxStatus, launchedBy, launcherId,
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
            awx_launched_by = $8,
            awx_launcher_id = $9,
            awx_launch_error = '',
            awx_finished_at = NULL,
            awx_synced_at = NULL,
            awx_notified_at = NULL,
            status = 'queued',
            progress = 0,
            duration_sec = 0
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
      launcherId || null,
    ],
  );
  await recordAttempt(requestId, {
    jobId, kind, templateId, templateName, status: awxStatus, launchedBy,
  });
};

/**
 * Lancement impossible : la demande passe en échec avec son motif, visible
 * dans le détail et le suivi des jobs. Un éventuel job précédent reste dans
 * l'historique des tentatives.
 * @param {string} requestId
 * @param {string} reason
 * @param {{ template?: any, launchedBy?: string, launcherId?: string }} [launch]
 */
const markFailed = async (requestId, reason, { template, launchedBy, launcherId } = {}) => {
  const error = String(reason || LAUNCH_FAILED).slice(0, 300);
  await q(
    `UPDATE requests
        SET awx_job_id = NULL,
            awx_job_url = '',
            awx_status = $2,
            awx_launch_error = $3,
            awx_launcher_id = COALESCE($4, awx_launcher_id),
            awx_finished_at = NULL,
            status = 'failed',
            progress = 0
      WHERE id = $1`,
    [requestId, LAUNCH_FAILED, error, launcherId || null],
  ).catch(() => {});
  await recordAttempt(requestId, {
    kind: template?.kind,
    templateId: template?.id,
    templateName: template?.name,
    status: LAUNCH_FAILED,
    error,
    launchedBy,
  }).catch(() => {});
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

  const launchedBy = user?.awxUsername || user?.name || '';
  const failure = { template, launchedBy, launcherId: user?.id };

  const token = await ensureAccessToken(session);
  if (!token) {
    await markFailed(request.id, 'no_awx_token', failure);
    return { skipped: 'no_token' };
  }

  // RBAC AWX : on refuse un modèle que l'utilisateur n'a pas le droit de lancer.
  const access = await awxRbac.accessForSession(session);
  if (!awxRbac.allowed(access, template.kind, template.id)) {
    await markFailed(request.id, 'rbac_forbidden', failure);
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
      launchedBy,
      launcherId: user?.id,
    });

    return {
      jobId,
      jobUrl,
      kind: template.kind,
      templateId: template.id,
      templateName: template.name,
      status: launched.status,
      launchedBy,
    };
  } catch (err) {
    console.error('[awx] lancement impossible :', err.message);
    await markFailed(request.id, err.message, failure);
    return { error: err.message };
  }
};

/**
 * Jeton pour relire un job : celui du lanceur (ses droits Ascender couvrent
 * forcément son job), sinon celui de la session fournie.
 */
const tokenForJob = async (request, fallbackSession) => {
  const launcher = await latestSessionForUser(request.awx_launcher_id || request.user_id).catch(() => null);
  const token = launcher ? await ensureAccessToken(launcher) : '';
  if (token) return token;
  return fallbackSession ? ensureAccessToken(fallbackSession) : '';
};

/** Durée écoulée : AWX ne remplit `elapsed` qu'en fin de job. */
const elapsedOf = (job) => {
  if (job.elapsed > 0) return Math.round(job.elapsed);
  if (!job.started) return 0;
  const end = job.finished ? new Date(job.finished).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(job.started).getTime()) / 1000));
};

/**
 * Progression : Ascender n'en publie pas. Pendant l'exécution, elle est
 * estimée d'après la durée prévue du service, sans jamais atteindre 100 %.
 */
const progressOf = (mapped, elapsed, estimatedMinutes) => {
  if (mapped === 'success') return 100;
  if (mapped === 'queued') return 0;
  if (mapped !== 'running') return null;
  const expected = Number(estimatedMinutes) * 60;
  if (!(expected > 0)) return 50;
  return Math.min(95, Math.max(5, Math.round((elapsed / expected) * 100)));
};

const mailText = (row) => {
  const portal = String(process.env.PORTAL_URL || '').trim().replace(/\/+$/, '');
  const service = row.name_fr || row.name_en || row.service_id;
  const verdict = {
    success: 'terminée avec succès',
    failed: 'en échec',
    canceled: 'annulée',
  }[row.status] || row.status;
  const lines = [
    `Votre demande ${row.id} (${service}) est ${verdict}.`,
    '',
    `Environnement : ${row.environment}`,
    `Job Ascender  : #${row.awx_job_id}${row.awx_job_template_name ? ` (${row.awx_job_template_name})` : ''}`,
    `Durée         : ${Math.round(Number(row.duration_sec) || 0)} s`,
  ];
  if (portal) lines.push('', `Détail et journal : ${portal}/requests/${row.id}`);
  lines.push('', 'Email automatique envoyé par le portail ASP.');
  return { subject: `[ASP] ${row.id} ${verdict} — ${service}`, text: lines.join('\n') };
};

/**
 * Notifie le demandeur de la fin du job, une seule fois : la ligne est
 * réservée par un UPDATE conditionnel (sûr avec plusieurs réplicas).
 */
const notifyFinished = async (requestId) => {
  if (String(process.env.JOB_NOTIFY_EMAIL || 'true').toLowerCase() === 'false') return null;
  const { rows } = await q(
    `UPDATE requests r
        SET awx_notified_at = now()
       FROM services s
      WHERE r.id = $1 AND s.id = r.service_id
        AND r.awx_notified_at IS NULL
        AND r.status IN ('success', 'failed', 'canceled')
     RETURNING r.id, r.status, r.environment, r.duration_sec, r.awx_job_id,
               r.awx_job_template_name, r.service_id, r.user_id, s.name_fr, s.name_en`,
    [requestId],
  );
  const row = rows[0];
  if (!row || !emailConfigured()) return null;
  const user = await q('SELECT email FROM users WHERE id = $1', [row.user_id]);
  const to = String(user.rows[0]?.email || '').trim();
  if (!to) return null;
  return sendEmail({ to, ...mailText(row) }).catch((err) => ({ sent: false, error: err.message }));
};

/**
 * Relit l'état d'un job dans Ascender et aligne la demande, sa tentative
 * courante et, en fin de job, notifie le demandeur. `request` est une ligne
 * de requests (avec estimated_minutes du service si disponible).
 * @param {{ request?: any, session?: any }} [args]
 */
const syncRequest = async ({ request, session } = {}) => {
  if (!request?.awx_job_id) return null;
  const token = await tokenForJob(request, session);
  if (!token) return null;

  const kind = request.awx_job_kind === 'workflow' ? 'workflow' : 'job';

  try {
    const job = kind === 'workflow'
      ? await awx.fetchWorkflowJob(request.awx_job_id, token)
      : await awx.fetchJob(request.awx_job_id, token);
    const mapped = awx.portalStatus(job.status);
    const elapsed = elapsedOf(job);

    await q(
      `UPDATE requests
          SET awx_status = $2,
              status = COALESCE($3, status),
              progress = COALESCE($4, progress),
              duration_sec = CASE WHEN $5 > 0 THEN $5 ELSE duration_sec END,
              awx_finished_at = $6,
              awx_synced_at = now()
        WHERE id = $1 AND awx_job_id = $7`,
      [
        request.id,
        job.status.slice(0, 40),
        mapped,
        progressOf(mapped, elapsed, request.estimated_minutes),
        elapsed,
        job.finished,
        request.awx_job_id,
      ],
    );
    await q(
      `UPDATE job_attempts SET status = $3, finished_at = $4, elapsed_sec = $5
        WHERE request_id = $1 AND awx_job_id = $2`,
      [request.id, request.awx_job_id, job.status.slice(0, 40), job.finished, elapsed],
    );
    if (TERMINAL_PORTAL.includes(mapped)) await notifyFinished(request.id);

    return {
      jobId: job.jobId,
      jobUrl: kind === 'workflow' ? awx.workflowJobUrl(job.jobId) : awx.jobUrl(job.jobId),
      kind,
      status: job.status,
      portalStatus: mapped,
      elapsed,
      templateId: job.templateId,
      templateName: job.templateName,
    };
  } catch (err) {
    console.error('[awx] synchronisation du job impossible :', err.message);
    // Passe au job suivant lors de la prochaine tournée.
    await q('UPDATE requests SET awx_synced_at = now() WHERE id = $1', [request.id]).catch(() => {});
    return null;
  }
};

const isActive = (awxStatus) => ACTIVE_AWX.includes(String(awxStatus || '').toLowerCase());

const isTerminal = (status) => TERMINAL_PORTAL.includes(status);

/**
 * Annule le job courant avec le jeton de la personne qui le demande (ses
 * droits Ascender s'appliquent), puis relit son état.
 */
const cancelForRequest = async ({ request, session }) => {
  const token = await ensureAccessToken(session);
  if (!token) return { error: 'no_token' };
  try {
    await awx.cancelJob({ kind: request.awx_job_kind, jobId: request.awx_job_id, accessToken: token });
  } catch (err) {
    if (err.status === 405) return { error: 'not_cancelable' };
    if (err.status === 403) return { error: 'rbac_forbidden' };
    return { error: 'cancel_failed', message: err.message };
  }
  await syncRequest({ request, session });
  return { ok: true };
};

/** Tentatives de lancement d'une demande, la plus récente d'abord. */
const listAttempts = async (requestId) => {
  const { rows } = await q(
    `SELECT attempt, awx_job_id, kind, template_id, template_name, status, error,
            launched_by, launched_at, finished_at, elapsed_sec
       FROM job_attempts WHERE request_id = $1 ORDER BY attempt DESC`,
    [requestId],
  );
  return rows.map((row) => ({
    attempt: Number(row.attempt),
    jobId: row.awx_job_id ? Number(row.awx_job_id) : null,
    jobUrl: row.awx_job_id
      ? (row.kind === 'workflow' ? awx.workflowJobUrl(row.awx_job_id) : awx.jobUrl(row.awx_job_id))
      : '',
    kind: row.kind,
    templateName: row.template_name,
    status: row.status,
    error: row.error,
    launchedBy: row.launched_by,
    launchedAt: row.launched_at instanceof Date ? row.launched_at.toISOString() : row.launched_at,
    finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at || null,
    elapsedSec: Number(row.elapsed_sec) || 0,
  }));
};

module.exports = {
  LAUNCH_FAILED,
  templateForService,
  templateIdForService,
  templateNameForService,
  launchForRequest,
  syncRequest,
  cancelForRequest,
  tokenForJob,
  listAttempts,
  notifyFinished,
  isActive,
  isTerminal,
};
