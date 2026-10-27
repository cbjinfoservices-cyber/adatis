const { q } = require('./db');
const { authMode } = require('./auth');
const awxJobs = require('./awxJobs');

/**
 * Synchronisation de fond des jobs Ascender actifs.
 *
 * Toutes les JOB_SYNC_INTERVAL_SEC secondes (15 par défaut), les jobs encore
 * en file ou en cours sont relus dans Ascender avec le jeton de leur lanceur,
 * les moins récemment lus d'abord. L'état en base reste ainsi à jour sans
 * visiteur, et le demandeur est notifié à la fin du job. Les pages ne font
 * que lire la base.
 *
 * Plusieurs réplicas peuvent tourner : les mises à jour sont idempotentes et
 * la notification de fin est réservée par un UPDATE conditionnel.
 */

const intervalMs = () => {
  const parsed = Number(process.env.JOB_SYNC_INTERVAL_SEC);
  return (Number.isFinite(parsed) && parsed >= 5 ? parsed : 15) * 1000;
};

const BATCH = 25;

/** Une tournée : renvoie le nombre de jobs relus. */
const syncActiveJobs = async ({ limit = BATCH } = {}) => {
  if (authMode() !== 'awx') return 0;
  const { rows } = await q(
    `SELECT r.*, s.estimated_minutes
       FROM requests r
       JOIN services s ON s.id = r.service_id
      WHERE r.awx_job_id IS NOT NULL AND r.status IN ('queued', 'running')
      ORDER BY r.awx_synced_at NULLS FIRST
      LIMIT $1`,
    [limit],
  );
  // Séquentiel : quelques appels Ascender à la fois, jamais une rafale.
  for (const request of rows) {
    // eslint-disable-next-line no-await-in-loop
    await awxJobs.syncRequest({ request }).catch(() => null);
  }
  return rows.length;
};

/** Démarre la tâche ; renvoie la fonction d'arrêt. */
const startJobMonitor = () => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await syncActiveJobs();
    } catch (err) {
      console.error('[jobs] synchronisation de fond impossible :', err.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs());
  if (typeof timer.unref === 'function') timer.unref();
  void tick();
  return () => clearInterval(timer);
};

module.exports = { syncActiveJobs, startJobMonitor };
