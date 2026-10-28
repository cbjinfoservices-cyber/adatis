const express = require('express');
const { q } = require('../db');
const m = require('../mappers');
const awx = require('../awx');
const awxJobs = require('../awxJobs');
const { scopeOf, scopeSql } = require('../access');
const { isWired, NOT_WIRED } = require('../engines');
const { REQUEST_SELECT } = require('../requestQueries');

const router = express.Router();

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

module.exports = router;
