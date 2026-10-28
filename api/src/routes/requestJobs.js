const express = require('express');
const { q } = require('../db');
const m = require('../mappers');
const awx = require('../awx');
const awxJobs = require('../awxJobs');
const approvalFlow = require('../approvalFlow');
const { scopeOf, canActOn } = require('../access');
const { isWired } = require('../engines');
const { authMode, ensureAccessToken } = require('../auth');
const { LAUNCH_SELECT, reload, findVisible } = require('../requestQueries');

/** Actions sur le job Ascender d'une demande : lancement, annulation, état, sortie. */
const router = express.Router();

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
    const row = await findVisible(req);
    if (!row) return res.status(404).json({ error: 'request_not_found' });
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
    const row = await findVisible(req);
    if (!row) return res.status(404).json({ error: 'request_not_found' });
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
    const row = await findVisible(req);
    if (!row) return res.status(404).json({ error: 'request_not_found' });
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
    const row = await findVisible(req);
    if (!row) return res.status(404).json({ error: 'request_not_found' });
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
    const row = await findVisible(req);
    if (!row) return res.status(404).json({ error: 'request_not_found' });
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

module.exports = router;
