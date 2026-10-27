const express = require('express');
const { q, withTransaction } = require('../db');
const m = require('../mappers');
const awx = require('../awx');
const awxJobs = require('../awxJobs');
const approvalFlow = require('../approvalFlow');
const { scopeOf, scopeSql, canSee, canActOn } = require('../access');
const awxRbac = require('../awxRbac');
const { validatePayload, sanitizeFreePayload } = require('../formValidation');
const { sealSecrets } = require('../secrets');
const { isWired, engineForService, NOT_WIRED } = require('../engines');
const { authMode, ensureAccessToken } = require('../auth');

const router = express.Router();

const REQUEST_SELECT = `
  SELECT r.*, s.name_fr, s.name_en, s.category_id, s.estimated_minutes,
         u.name AS user_name, u.initials,
         t.name AS tenant_name, cn.name AS connector_name
  FROM requests r
  JOIN services s ON s.id = r.service_id
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN tenants t ON t.id = r.tenant_id
  LEFT JOIN connectors cn ON cn.id = r.connector_id
`;

const LAUNCH_SELECT = `
  SELECT id, name_fr, name_en, approval,
         awx_job_template_id, awx_job_template_name,
         awx_workflow_job_template_id, awx_workflow_job_template_name
  FROM services WHERE id = $1
`;

/** Note bilingue d'une étape de la frise. */
const note = (fr, en = fr) => ({ fr, en });

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
  let launch = ['pending', note('')];
  if (row.awx_job_id) launch = ['success', note(`Job ${job} lancé par ${by}`, `Job ${job} launched by ${by}`)];
  else if (row.awx_status === 'launch_failed') launch = ['failed', note('Lancement refusé par Ascender', 'Launch refused by Ascender')];
  else if (row.awx_status === 'awaiting_requester') launch = ['running', note('À lancer par le demandeur', 'To be launched by the requester')];
  steps.push({ key: 'launch', status: launch[0], note: launch[1] });

  let exec = ['pending', note('')];
  if (row.awx_job_id) {
    exec = {
      queued: ['running', note('En file dans Ascender', 'Queued in Ascender')],
      running: ['running', note('En cours dans Ascender', 'Running in Ascender')],
      success: ['success', note('Terminée avec succès', 'Completed successfully')],
      failed: ['failed', note('Job en échec', 'Job failed')],
      canceled: ['failed', note('Job annulé', 'Job canceled')],
    }[row.status] || exec;
  }
  steps.push({ key: 'exec', status: exec[0], note: exec[1] });
  steps.push({ key: 'done', status: row.awx_job_id && row.status === 'success' ? 'success' : 'pending', note: note('') });
  return steps;
};

/** Ligne fraîche d'une demande (après lancement, synchronisation, annulation). */
const reload = async (id) => (await q(`${REQUEST_SELECT} WHERE r.id = $1`, [id])).rows[0];

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
    const row = await reload(req.params.id);
    if (!row || !canSee(scopeOf(req), row)) return res.status(404).json({ error: 'request_not_found' });

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

    const { rows } = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [created.id]);
    return res.status(201).json({ ...m.request(rows[0]), awxLaunch: launch, approvalId: created.approvalId });
  } catch (err) { return next(err); }
});

/**
 * Lancement manuel : première exécution (approuvée sans jeton du demandeur,
 * incident Ascender) ou relance après un job en échec ou annulé. Chaque
 * lancement ajoute une tentative à l'historique de la demande.
 */
router.post('/requests/:id/awx/launch', async (req, res, next) => {
  try {
    if (authMode() !== 'awx' || !req.auth?.session) {
      return res.status(409).json({ error: 'awx_disabled' });
    }
    const row = await reload(req.params.id);
    if (!row || !canSee(scopeOf(req), row)) return res.status(404).json({ error: 'request_not_found' });
    if (!canActOn(scopeOf(req), row)) return res.status(403).json({ error: 'forbidden' });
    if (row.awx_job_id && awxJobs.isActive(row.awx_status)) {
      return res.status(409).json({ error: 'awx_job_active' });
    }
    // Un job réussi n'est jamais relancé (risque de double provisionnement).
    if (row.awx_job_id && !['failed', 'canceled'].includes(row.status)) {
      return res.status(409).json({ error: 'awx_job_exists' });
    }
    if (row.connector_kind && !isWired(row.connector_kind)) {
      return res.status(409).json({ error: 'engine_not_wired' });
    }
    if (!approvalFlow.LAUNCHABLE.includes(row.approval_state)) {
      return res.status(409).json({ error: `approval_${row.approval_state}` });
    }

    const svc = await q(LAUNCH_SELECT, [row.service_id]);
    if (!svc.rows.length) return res.status(404).json({ error: 'service_not_found' });

    const launch = await awxJobs.launchForRequest({
      request: row,
      service: svc.rows[0],
      session: req.auth.session,
      user: req.auth.user,
    });

    if (launch?.error) return res.status(502).json({ error: 'awx_launch_failed', message: launch.error });
    if (launch?.skipped) return res.status(409).json({ error: launch.skipped });

    return res.json({
      ...m.request(await reload(req.params.id)),
      attempts: await awxJobs.listAttempts(req.params.id),
    });
  } catch (err) { return next(err); }
});

/** Annule le job en cours, avec les droits Ascender de la personne connectée. */
router.post('/requests/:id/awx/cancel', async (req, res, next) => {
  try {
    if (authMode() !== 'awx' || !req.auth?.session) {
      return res.status(409).json({ error: 'awx_disabled' });
    }
    const row = await reload(req.params.id);
    if (!row || !canSee(scopeOf(req), row)) return res.status(404).json({ error: 'request_not_found' });
    if (!canActOn(scopeOf(req), row)) return res.status(403).json({ error: 'forbidden' });
    if (!row.awx_job_id) return res.status(409).json({ error: 'awx_job_missing' });
    if (!awxJobs.isActive(row.awx_status)) return res.status(409).json({ error: 'not_cancelable' });

    const result = await awxJobs.cancelForRequest({ request: row, session: req.auth.session });
    if (result.error === 'rbac_forbidden') return res.status(403).json({ error: 'rbac_forbidden' });
    if (result.error === 'cancel_failed') {
      return res.status(502).json({ error: 'awx_cancel_failed', message: result.message });
    }
    if (result.error) return res.status(409).json({ error: result.error });

    return res.json(m.request(await reload(req.params.id)));
  } catch (err) { return next(err); }
});

/**
 * Rafraîchit tout de suite l'état du job (bouton de l'interface), avec le
 * jeton du lanceur ou, à défaut, celui de la personne connectée.
 */
router.post('/requests/:id/awx/sync', async (req, res, next) => {
  try {
    const row = await reload(req.params.id);
    if (!row || !canSee(scopeOf(req), row)) return res.status(404).json({ error: 'request_not_found' });
    if (!row.awx_job_id) return res.status(409).json({ error: 'awx_job_missing' });
    if (!req.auth?.session) return res.status(401).json({ error: 'awx_session_missing' });

    const job = await awxJobs.syncRequest({ request: row, session: req.auth.session });
    if (!job) return res.status(502).json({ error: 'awx_sync_failed' });

    return res.json({ ...m.request(await reload(req.params.id)), awxJob: job });
  } catch (err) { return next(err); }
});

/**
 * Détail des étapes d'un workflow AWX : chaque nœud avec son statut réel.
 */
router.get('/requests/:id/awx/workflow', async (req, res, next) => {
  try {
    const row = await reload(req.params.id);
    if (!row || !canSee(scopeOf(req), row)) return res.status(404).json({ error: 'request_not_found' });
    if (!row.awx_job_id) return res.status(409).json({ error: 'awx_job_missing' });
    if (row.awx_job_kind !== 'workflow') return res.status(409).json({ error: 'not_a_workflow' });
    if (!req.auth?.session) return res.status(401).json({ error: 'awx_session_missing' });

    // Statut des étapes : jeton du lanceur, comme la synchronisation.
    const token = await awxJobs.tokenForJob(row, req.auth.session);
    if (!token) return res.status(401).json({ error: 'awx_token_missing' });

    const nodes = await awx.fetchWorkflowNodes(row.awx_job_id, token);
    return res.json({
      nodes,
      jobId: Number(row.awx_job_id),
      jobUrl: awx.workflowJobUrl(row.awx_job_id),
    });
  } catch (err) { return next(err); }
});

/**
 * Sortie (stdout) d'un job de la demande, lue avec le jeton de la personne
 * connectée : Ascender applique ses propres droits de lecture. `jobId`
 * désigne une tentative précédente ou un nœud du workflow courant ; sans
 * lui, le job courant (job simple uniquement).
 */
router.get('/requests/:id/awx/output', async (req, res, next) => {
  try {
    const row = await reload(req.params.id);
    if (!row || !canSee(scopeOf(req), row)) return res.status(404).json({ error: 'request_not_found' });
    if (!req.auth?.session) return res.status(401).json({ error: 'awx_session_missing' });
    const token = await ensureAccessToken(req.auth.session);
    if (!token) return res.status(401).json({ error: 'awx_token_missing' });

    const wanted = Number(req.query.jobId) || 0;
    let jobId = Number(row.awx_job_id) || 0;
    if (!wanted) {
      if (!jobId) return res.status(409).json({ error: 'awx_job_missing' });
      if (row.awx_job_kind === 'workflow') return res.status(400).json({ error: 'node_required' });
    } else {
      // Seuls les jobs rattachés à cette demande sont lisibles ici.
      const attempt = await q(
        "SELECT 1 FROM job_attempts WHERE request_id = $1 AND awx_job_id = $2 AND kind = 'job'",
        [row.id, wanted],
      );
      let allowed = attempt.rows.length > 0;
      if (!allowed && row.awx_job_kind === 'workflow' && row.awx_job_id) {
        const nodes = await awx.fetchWorkflowNodes(row.awx_job_id, token).catch(() => []);
        allowed = nodes.some((node) => node.jobId === wanted && node.type === 'job');
      }
      if (!allowed) return res.status(404).json({ error: 'job_not_in_request' });
      jobId = wanted;
    }

    try {
      const output = await awx.fetchJobOutput(jobId, token);
      return res.json({ jobId, ...output });
    } catch (err) {
      if (err.status === 403 || err.status === 404) {
        return res.status(403).json({ error: 'awx_output_forbidden' });
      }
      return res.status(502).json({ error: 'awx_output_failed', message: err.message });
    }
  } catch (err) { return next(err); }
});

const emptyStats = () => ({
  total: 0, active: 0, success: 0, failed: 0, notWired: 0,
});

const addToStats = (stats, item) => {
  stats.total += 1;
  if (['queued', 'running'].includes(item.portalStatus)) stats.active += 1;
  if (item.portalStatus === 'success') stats.success += 1;
  if (['failed', 'canceled'].includes(item.portalStatus)) stats.failed += 1;
  if (item.portalStatus === NOT_WIRED) stats.notWired += 1;
};

/**
 * Suivi des jobs, scindé par type de connecteur (moteur).
 *
 * Une ligne = une demande routée vers un moteur : job lancé (Ascender) ou
 * demande destinée à un moteur pas encore branché (statut « not_wired »).
 * `kind` filtre un moteur ; `stats` couvre tous les moteurs et `byKind`
 * les détaille. Un lancement refusé par Ascender y figure en « failed ».
 */
async function listJobs(req, res, next) {
  try {
    const {
      status, user, search, kind, limit = 200,
    } = req.query;
    const max = Math.min(Number(limit) || 200, 500);

    const params = [];
    const scoped = scopeSql(scopeOf(req), 'r', params);
    params.push(max);
    const jobsSql = `${REQUEST_SELECT}
       WHERE (r.awx_job_id IS NOT NULL OR r.awx_status = 'launch_failed'
              OR r.connector_kind NOT IN ('', 'ascender'))
             ${scoped ? ` AND ${scoped}` : ''}
       ORDER BY COALESCE(r.awx_started_at, r.created_at) DESC
       LIMIT $${params.length}`;
    // État tenu à jour par la synchronisation de fond (jobMonitor) : la liste
    // ne fait que lire la base, quel que soit le nombre de visiteurs.
    const { rows } = await q(jobsSql, params);

    const items = rows.map((row) => {
      const base = m.request(row);
      const engine = base.engine.kind || 'ascender';
      let portalStatus = NOT_WIRED;
      if (isWired(engine)) portalStatus = base.launchError ? 'failed' : awx.portalStatus(base.awx?.status) || '';
      return {
        ...base,
        jobKind: base.awx?.kind || 'job',
        awxStatus: base.awx?.status || (base.launchError ? awxJobs.LAUNCH_FAILED : ''),
        portalStatus,
      };
    });

    // Types présents : connecteurs configurés + moteurs vus dans les demandes.
    const connectorKinds = await q('SELECT DISTINCT kind FROM connectors');
    const kinds = [...new Set([
      ...connectorKinds.rows.map((r) => r.kind),
      ...items.map((item) => item.engine.kind || 'ascender'),
    ])].sort((a, b) => (a === 'ascender' ? -1 : b === 'ascender' ? 1 : a.localeCompare(b)));

    const stats = emptyStats();
    const byKind = Object.fromEntries(kinds.map((k) => [k, { ...emptyStats(), wired: isWired(k) }]));
    items.forEach((item) => {
      addToStats(stats, item);
      addToStats(byKind[item.engine.kind || 'ascender'], item);
    });

    const needle = String(search || '').trim().toLowerCase();
    const userNeedle = String(user || '').trim().toLowerCase();
    const wanted = String(status || '').trim().toLowerCase();
    const wantedKind = String(kind || '').trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (wantedKind && wantedKind !== 'all' && (item.engine.kind || 'ascender') !== wantedKind) return false;
      if (wanted && wanted !== 'all') {
        const raw = String(item.awxStatus || '').toLowerCase();
        const mapped = String(item.portalStatus || '').toLowerCase();
        if (raw !== wanted && mapped !== wanted) return false;
      }
      if (userNeedle && String(item.user || '').toLowerCase() !== userNeedle) return false;
      if (!needle) return true;
      return `${item.id} ${item.service.fr} ${item.service.en} ${item.user} ${item.tenant} ${item.awx?.templateName || ''} ${item.engine.kind} ${item.engine.connectorName}`
        .toLowerCase()
        .includes(needle);
    });

    return res.json({
      items: filtered, stats, byKind, kinds, fetchedAt: new Date().toISOString(),
    });
  } catch (err) { return next(err); }
}

router.get('/jobs', listJobs);
// Ancienne adresse (suivi Ascender seul), conservée pour compatibilité.
router.get('/awx/jobs', listJobs);

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

    const full = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    return res.json(m.request(full.rows[0]));
  } catch (err) { return next(err); }
});

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [kpi, statuses, daily, topServices, topUsers, topTenants] = await Promise.all([
      q('SELECT * FROM v_dashboard_kpi'),
      q('SELECT status AS key, value FROM v_dashboard_status'),
      q('SELECT day, value FROM v_dashboard_daily ORDER BY day'),
      q('SELECT * FROM v_dashboard_top_services'),
      q('SELECT * FROM v_dashboard_top_users'),
      q('SELECT * FROM v_dashboard_top_tenants'),
    ]);

    const k = kpi.rows[0] || {};
    res.json({
      totalJobs: Number(k.total_jobs || 0),
      successRate: Number(k.success_rate || 0),
      failures: Number(k.failures || 0),
      avgDurationSec: Number(k.avg_duration_sec || 0),
      trendTotal: daily.rows.map((r) => Number(r.value)),
      statusDistribution: statuses.rows.map((r) => ({ key: r.key, value: Number(r.value) })),
      topServices: topServices.rows.map((r) => ({
        name: { fr: r.name_fr, en: r.name_en },
        value: Number(r.value),
      })),
      topUsers: topUsers.rows.map((r) => ({
        name: r.name,
        initials: r.initials,
        role: r.role_fr,
        roleI18n: { fr: r.role_fr, en: r.role_en },
        jobs: Number(r.jobs),
        rate: Number(r.rate),
      })),
      topTenants: topTenants.rows.map((r) => ({
        name: r.name,
        plan: r.plan,
        jobs: Number(r.jobs),
        rate: Number(r.rate),
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;