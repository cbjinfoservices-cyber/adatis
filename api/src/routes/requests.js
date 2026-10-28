const express = require('express');
const { q, withTransaction } = require('../db');
const m = require('../mappers');
const awxJobs = require('../awxJobs');
const approvalFlow = require('../approvalFlow');
const { scopeOf, scopeSql } = require('../access');
const awxRbac = require('../awxRbac');
const { validatePayload, sanitizeFreePayload } = require('../formValidation');
const { sealSecrets } = require('../secrets');
const { isWired, engineForService } = require('../engines');
const { authMode } = require('../auth');
const {
  REQUEST_SELECT, LAUNCH_SELECT, reload, findVisible,
} = require('../requestQueries');

/**
 * Demandes : liste, détail (avec frise), création (validation, approbation,
 * lancement) et mise à jour. Actions sur le job : requestJobs.js.
 */
const router = express.Router();

/** Note bilingue d'une étape de la frise. */
const note = (fr, en = fr) => ({ fr, en });

/** @typedef {[status: string, note: { fr: string, en: string }]} Step */

/**
 * Frise réelle d'une demande : soumission, approbation éventuelle, lancement
 * Ascender, exécution, fin. Chaque étape reflète l'état enregistré.
 */
const buildTimeline = (row) => {
  const steps = [{ key: 'submit', status: 'success', note: note('Demande enregistrée', 'Request recorded') }];

  if (row.approval !== 'none') {
    const approval = {
      pending: ['running', note('En attente de décision', 'Awaiting decision')],
      granted: ['success', note('Approuvée', 'Approved')],
      rejected: ['failed', note('Refusée', 'Rejected')],
    }[row.approval_state] || ['pending', note('')];
    steps.push({ key: 'approval', status: approval[0], note: approval[1] });
  }

  const job = `#${row.awx_job_id}`;
  const by = row.awx_launched_by || '—';
  /** @type {Step} */
  let launch = ['pending', note('')];
  if (row.awx_job_id) launch = ['success', note(`Job ${job} lancé par ${by}`, `Job ${job} launched by ${by}`)];
  else if (row.awx_status === 'launch_failed') launch = ['failed', note('Lancement refusé par Ascender', 'Launch refused by Ascender')];
  else if (row.awx_status === 'awaiting_requester') launch = ['running', note('À lancer par le demandeur', 'To be launched by the requester')];
  steps.push({ key: 'launch', status: launch[0], note: launch[1] });

  /** @type {Step} */
  let exec = ['pending', note('')];
  if (row.awx_job_id) {
    exec = /** @type {Record<string, Step>} */ ({
      queued: ['running', note('En file dans Ascender', 'Queued in Ascender')],
      running: ['running', note('En cours dans Ascender', 'Running in Ascender')],
      success: ['success', note('Terminée avec succès', 'Completed successfully')],
      failed: ['failed', note('Job en échec', 'Job failed')],
      canceled: ['failed', note('Job annulé', 'Job canceled')],
    })[row.status] || exec;
  }
  steps.push({ key: 'exec', status: exec[0], note: exec[1] });
  steps.push({ key: 'done', status: row.awx_job_id && row.status === 'success' ? 'success' : 'pending', note: note('') });
  return steps;
};

router.get('/requests', async (req, res, next) => {
  try {
    const { status, serviceId, tenantId, q: search, limit = 50 } = req.query;
    const where = [];
    const params = [];

    if (status) { params.push(status); where.push(`r.status = $${params.length}`); }
    if (serviceId) { params.push(serviceId); where.push(`r.service_id = $${params.length}`); }
    if (tenantId) { params.push(tenantId); where.push(`r.tenant_id = $${params.length}`); }
    if (search) {
      params.push(`%${String(search).trim()}%`);
      const i = params.length;
      where.push(`(r.id ILIKE $${i} OR s.name_fr ILIKE $${i} OR s.name_en ILIKE $${i}
                   OR u.name ILIKE $${i} OR t.name ILIKE $${i})`);
    }
    const scoped = scopeSql(scopeOf(req), 'r', params);
    if (scoped) where.push(scoped);

    params.push(Math.min(Number(limit) || 50, 200));
    const { rows } = await q(
      `${REQUEST_SELECT}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    res.json(rows.map(m.request));
  } catch (err) { next(err); }
});

router.get('/requests/:id', async (req, res, next) => {
  try {
    const row = await findVisible(req);
    if (!row) return res.status(404).json({ error: 'request_not_found' });

    // L'état des jobs est tenu à jour par la synchronisation de fond
    // (jobMonitor) : l'affichage ne fait que lire la base.
    const detailRows = await q('SELECT * FROM execution_details WHERE request_id = $1', [req.params.id]);
    const stored = detailRows.rows.length ? m.executionDetail(detailRows.rows[0]) : null;

    return res.json({
      ...m.request(row),
      timeline: stored?.timeline?.length ? stored.timeline : buildTimeline(row),
      logs: stored?.logs || [],
      result: stored?.result,
      error: stored?.error,
      attempts: await awxJobs.listAttempts(req.params.id),
    });
  } catch (err) { return next(err); }
});

router.post('/requests', async (req, res, next) => {
  try {
    const { serviceId, environment = 'dev', payload = {} } = req.body || {};
    if (!serviceId) return res.status(400).json({ error: 'service_required' });
    if (!['dev', 'qa', 'staging', 'prod'].includes(environment)) {
      return res.status(400).json({ error: 'invalid_environment' });
    }

    // Une session impose l'utilisateur et le tenant courants ; les valeurs du
    // client ne sont acceptées qu'en mode développement (sans SSO).
    const sessionUser = req.auth?.user || null;
    const userId = sessionUser ? sessionUser.id : req.body?.userId || null;
    const tenantId = sessionUser ? sessionUser.tenantId || null : req.body?.tenantId || null;

    const svc = await q(
      `SELECT s.id, s.approval, s.awx_job_template_id, s.awx_workflow_job_template_id,
              s.connector_id, c.kind AS connector_kind, f.fields
         FROM services s
         LEFT JOIN connectors c ON c.id = s.connector_id
         LEFT JOIN form_schemas f ON f.id = s.form_id
        WHERE s.id = $1`,
      [serviceId],
    );
    if (!svc.rows.length) return res.status(404).json({ error: 'service_not_found' });
    const service = svc.rows[0];
    const { approval } = service;
    // Moteur retenu à la commande : conservé sur la demande.
    const engine = engineForService(service);

    // RBAC Ascender vérifié dès la commande, pas seulement au lancement.
    if (req.auth?.session && engine === 'ascender') {
      const template = awxJobs.templateForService(service);
      const access = template ? await awxRbac.accessForSession(req.auth.session) : null;
      if (template && !awxRbac.allowed(access, template.kind, template.id)) {
        return res.status(403).json({ error: 'service_forbidden' });
      }
    }

    // Valeurs du formulaire validées côté serveur : ce sont elles qui partent
    // dans les extra_vars Ascender.
    let values;
    let secretFields = [];
    if (Array.isArray(service.fields)) {
      const checked = validatePayload(service.fields, payload);
      if (checked.errors.length) {
        return res.status(422).json({ error: 'invalid_payload', fields: checked.errors });
      }
      values = checked.values;
      secretFields = checked.secrets;
    } else {
      values = sanitizeFreePayload(payload);
    }

    const created = await withTransaction(async (client) => {
      const seq = await client.query('SELECT nextval(\'request_ref_seq\') AS n');
      const id = `REQ-${new Date().getFullYear()}-${seq.rows[0].n}`;

      await client.query(
        `INSERT INTO requests (id, service_id, user_id, tenant_id, environment, status, progress,
                               approval, approval_state, business_type, payload,
                               connector_id, connector_kind)
         VALUES ($1,$2,$3,$4,$5,'queued',0,$6,$7,'custom',$8,$9,$10)`,
        [id, serviceId, userId, tenantId, environment, approval,
          approval === 'none' ? 'not_required' : 'pending',
          // Champs « password » chiffrés en base, jamais stockés en clair.
          JSON.stringify(sealSecrets(values, secretFields)),
          engine ? service.connector_id : null, engine],
      );

      // Service soumis à approbation : circuit créé, aucun lancement immédiat.
      const approvalId = approval === 'none'
        ? null
        : await approvalFlow.createApproval(client, {
          requestId: id, serviceId, approval, userId, tenantId, environment, payload,
        });
      return { id, approvalId };
    });

    // Lancement du job Ascender avec le jeton de l'utilisateur connecté.
    let launch = null;
    // Seuls les moteurs branchés (Ascender) lancent réellement un job.
    if (!created.approvalId && isWired(engine) && authMode() === 'awx' && req.auth?.session) {
      const launchService = await q(LAUNCH_SELECT, [serviceId]);
      if (launchService.rows.length) {
        launch = await awxJobs.launchForRequest({
          request: {
            id: created.id, serviceId, environment, payload: values,
          },
          service: launchService.rows[0],
          session: req.auth.session,
          user: req.auth.user,
        });
      }
    }

    return res.status(201).json({ ...m.request(await reload(created.id)), awxLaunch: launch, approvalId: created.approvalId });
  } catch (err) { return next(err); }
});

router.patch('/requests/:id', async (req, res, next) => {
  try {
    const { status, progress } = req.body || {};
    const fields = [];
    const params = [];

    if (status) {
      if (!['queued', 'running', 'success', 'failed', 'canceled'].includes(status)) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      params.push(status);
      fields.push(`status = $${params.length}`);
    }
    if (progress !== undefined) {
      params.push(Math.max(0, Math.min(100, Number(progress) || 0)));
      fields.push(`progress = $${params.length}`);
    }
    if (!fields.length) return res.status(400).json({ error: 'nothing_to_update' });

    params.push(req.params.id);
    const { rows } = await q(
      `UPDATE requests SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id`,
      params,
    );
    if (!rows.length) return res.status(404).json({ error: 'request_not_found' });

    return res.json(m.request(await reload(req.params.id)));
  } catch (err) { return next(err); }
});

module.exports = router;