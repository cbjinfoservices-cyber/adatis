const express = require('express');
const { q, withTransaction } = require('../db');
const m = require('../mappers');
const awx = require('../awx');
const awxJobs = require('../awxJobs');
const approvalFlow = require('../approvalFlow');
const { scopeOf, scopeSql, canSee, canActOn } = require('../access');
const { authMode, ensureAccessToken } = require('../auth');

const router = express.Router();

const REQUEST_SELECT = `
  SELECT r.*, s.name_fr, s.name_en, s.category_id,
         u.name AS user_name, u.initials,
         t.name AS tenant_name
  FROM requests r
  JOIN services s ON s.id = r.service_id
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN tenants t ON t.id = r.tenant_id
`;

const LAUNCH_SELECT = `
  SELECT id, name_fr, name_en, approval,
         awx_job_template_id, awx_job_template_name,
         awx_workflow_job_template_id, awx_workflow_job_template_name
  FROM services WHERE id = $1
`;

const TERMINAL_AWX = ['successful', 'failed', 'error', 'canceled'];

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
    let { rows } = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    if (!rows.length || !canSee(scopeOf(req), rows[0])) return res.status(404).json({ error: 'request_not_found' });

    // Job AWX encore actif : on rafraîchit son état avant de répondre.
    if (rows[0].awx_job_id
      && ['queued', 'running'].includes(rows[0].status)
      && req.auth?.session) {
      await awxJobs.syncRequest({ request: rows[0], session: req.auth.session });
      ({ rows } = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]));
    }

    const detailRows = await q('SELECT * FROM execution_details WHERE request_id = $1', [req.params.id]);
    const detail = detailRows.rows.length
      ? m.executionDetail(detailRows.rows[0])
      : { timeline: [], logs: [] };

    return res.json({ ...m.request(rows[0]), ...detail });
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

    const created = await withTransaction(async (client) => {
      const svc = await client.query('SELECT id, approval FROM services WHERE id = $1', [serviceId]);
      if (!svc.rows.length) return null;
      const { approval } = svc.rows[0];

      const seq = await client.query('SELECT nextval(\'request_ref_seq\') AS n');
      const id = `REQ-${new Date().getFullYear()}-${seq.rows[0].n}`;

      await client.query(
        `INSERT INTO requests (id, service_id, user_id, tenant_id, environment, status, progress,
                               approval, approval_state, business_type, payload)
         VALUES ($1,$2,$3,$4,$5,'queued',0,$6,$7,'custom',$8)`,
        [id, serviceId, userId, tenantId, environment, approval,
          approval === 'none' ? 'not_required' : 'pending', JSON.stringify(payload)],
      );

      // Service soumis à approbation : circuit créé, aucun lancement immédiat.
      const approvalId = approval === 'none'
        ? null
        : await approvalFlow.createApproval(client, {
          requestId: id, serviceId, approval, userId, tenantId, environment, payload,
        });
      return { id, approvalId };
    });

    if (!created) return res.status(404).json({ error: 'service_not_found' });

    // Lancement du job Ascender avec le jeton de l'utilisateur connecté.
    let launch = null;
    if (!created.approvalId && authMode() === 'awx' && req.auth?.session) {
      const svc = await q(LAUNCH_SELECT, [serviceId]);
      if (svc.rows.length) {
        launch = await awxJobs.launchForRequest({
          request: {
            id: created.id, serviceId, environment, payload,
          },
          service: svc.rows[0],
          session: req.auth.session,
          user: req.auth.user,
        });
      }
    }

    const { rows } = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [created.id]);
    return res.status(201).json({ ...m.request(rows[0]), awxLaunch: launch, approvalId: created.approvalId });
  } catch (err) { return next(err); }
});

/** Relance manuelle du job template (nouvelle demande ou incident AWX). */
router.post('/requests/:id/awx/launch', async (req, res, next) => {
  try {
    if (authMode() !== 'awx' || !req.auth?.session) {
      return res.status(409).json({ error: 'awx_disabled' });
    }
    const { rows } = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    if (!rows.length || !canSee(scopeOf(req), rows[0])) return res.status(404).json({ error: 'request_not_found' });
    if (!canActOn(scopeOf(req), rows[0])) return res.status(403).json({ error: 'forbidden' });
    if (rows[0].awx_job_id) return res.status(409).json({ error: 'awx_job_exists' });
    if (!approvalFlow.LAUNCHABLE.includes(rows[0].approval_state)) {
      return res.status(409).json({ error: `approval_${rows[0].approval_state}` });
    }

    const svc = await q(LAUNCH_SELECT, [rows[0].service_id]);
    if (!svc.rows.length) return res.status(404).json({ error: 'service_not_found' });

    const launch = await awxJobs.launchForRequest({
      request: rows[0],
      service: svc.rows[0],
      session: req.auth.session,
      user: req.auth.user,
    });

    if (launch?.error) return res.status(502).json({ error: 'awx_launch_failed', message: launch.error });
    if (launch?.skipped) return res.status(409).json({ error: launch.skipped });

    const full = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    return res.json(m.request(full.rows[0]));
  } catch (err) { return next(err); }
});

/** Rafraîchit l'état du job AWX à la demande de l'interface. */
router.post('/requests/:id/awx/sync', async (req, res, next) => {
  try {
    const { rows } = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    if (!rows.length || !canSee(scopeOf(req), rows[0])) return res.status(404).json({ error: 'request_not_found' });
    if (!rows[0].awx_job_id) return res.status(409).json({ error: 'awx_job_missing' });
    if (!req.auth?.session) return res.status(401).json({ error: 'awx_session_missing' });

    const job = await awxJobs.syncRequest({ request: rows[0], session: req.auth.session });
    if (!job) return res.status(502).json({ error: 'awx_sync_failed' });

    const full = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    return res.json({ ...m.request(full.rows[0]), awxJob: job });
  } catch (err) { return next(err); }
});

/**
 * Détail des étapes d'un workflow AWX : chaque nœud avec son statut réel.
 */
router.get('/requests/:id/awx/workflow', async (req, res, next) => {
  try {
    const { rows } = await q(`${REQUEST_SELECT} WHERE r.id = $1`, [req.params.id]);
    if (!rows.length || !canSee(scopeOf(req), rows[0])) return res.status(404).json({ error: 'request_not_found' });
    const row = rows[0];
    if (!row.awx_job_id) return res.status(409).json({ error: 'awx_job_missing' });
    if (row.awx_job_kind !== 'workflow') return res.status(409).json({ error: 'not_a_workflow' });
    if (!req.auth?.session) return res.status(401).json({ error: 'awx_session_missing' });

    const token = await ensureAccessToken(req.auth.session);
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
 * Suivi agrégé de tous les jobs AWX lancés depuis le portail.
 * `refresh=1` synchronise d'abord les jobs encore actifs (max 25 par passe).
 */
router.get('/awx/jobs', async (req, res, next) => {
  try {
    const { refresh, status, user, search, limit = 200 } = req.query;
    const max = Math.min(Number(limit) || 200, 500);

    const params = [];
    const scoped = scopeSql(scopeOf(req), 'r', params);
    params.push(max);
    const jobsSql = `${REQUEST_SELECT}
       WHERE r.awx_job_id IS NOT NULL${scoped ? ` AND ${scoped}` : ''}
       ORDER BY COALESCE(r.awx_started_at, r.created_at) DESC
       LIMIT $${params.length}`;
    let { rows } = await q(jobsSql, params);

    const wantsRefresh = ['1', 'true', 'yes'].includes(String(refresh || '').toLowerCase());
    if (wantsRefresh && req.auth?.session) {
      const active = rows
        .filter((row) => !TERMINAL_AWX.includes(String(row.awx_status || '').toLowerCase()))
        .slice(0, 25);
      if (active.length) {
        await Promise.all(active.map((row) => awxJobs
          .syncRequest({ request: row, session: req.auth.session })
          .catch(() => null)));
        ({ rows } = await q(jobsSql, params));
      }
    }

    const items = rows.map((row) => {
      const base = m.request(row);
      return {
        ...base,
        jobKind: base.awx?.kind || 'job',
        awxStatus: base.awx?.status || '',
        portalStatus: awx.portalStatus(base.awx?.status) || '',
      };
    });

    const needle = String(search || '').trim().toLowerCase();
    const userNeedle = String(user || '').trim().toLowerCase();
    const wanted = String(status || '').trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (wanted && wanted !== 'all') {
        const raw = String(item.awxStatus || '').toLowerCase();
        const mapped = String(item.portalStatus || '').toLowerCase();
        if (raw !== wanted && mapped !== wanted) return false;
      }
      if (userNeedle && String(item.user || '').toLowerCase() !== userNeedle) return false;
      if (!needle) return true;
      return `${item.id} ${item.service.fr} ${item.service.en} ${item.user} ${item.tenant} ${item.awx?.templateName || ''}`
        .toLowerCase()
        .includes(needle);
    });

    const stats = {
      total: items.length,
      active: items.filter((item) => ['queued', 'running'].includes(item.portalStatus)).length,
      success: items.filter((item) => item.portalStatus === 'success').length,
      failed: items.filter((item) => ['failed', 'canceled'].includes(item.portalStatus)).length,
    };

    return res.json({ items: filtered, stats, fetchedAt: new Date().toISOString() });
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