const { q } = require('./db');
const { getSettings } = require('./settings');
const { pushMemory, collectProbes, pruneProbes } = require('./probeStore');
const { startAlertEvaluation } = require('./alerts');

/**
 * Moniteur de disponibilité.
 *
 * Deux sources alimentent l'historique :
 *  - les sondes envoyées par le portail (/api/system/health) ;
 *  - une sonde interne toutes les 60 s, pour que l'historique existe même
 *    quand personne n'a la page ouverte.
 *
 * Chaque point est écrit en base (table health_probes) *et* conservé en
 * mémoire dans le processus (cf. probeStore). La mémoire est indispensable
 * pour les périodes où PostgreSQL est justement indisponible : à ce moment
 * l'insertion échoue, mais l'incident reste visible dans l'historique.
 */

const WINDOW_HOURS = 24;
const BUCKET_MINUTES = 15;
const PRUNE_EVERY = 60;
const PROBE_INTERVAL_MS = 60 * 1000;

let inserted = 0;

/** Enregistre un point de mesure (best effort côté base). */
const recordProbe = async ({ up, latencyMs = null }) => {
  const checkedAt = new Date().toISOString();
  const latency = latencyMs === null || latencyMs === undefined ? null : Number(latencyMs);
  pushMemory(checkedAt, Boolean(up), latency);

  try {
    await q(
      'INSERT INTO health_probes (checked_at, database_up, latency_ms) VALUES ($1, $2, $3)',
      [checkedAt, Boolean(up), latency],
    );
    inserted += 1;
    if (inserted % PRUNE_EVERY === 0) {
      // Rétention réglable depuis la page Système (1 à 90 jours).
      const settings = await getSettings();
      await pruneProbes(settings.retentionDays);
    }
  } catch {
    /* Table absente ou base indisponible : la mémoire suffit pour l'affichage. */
  }

  return checkedAt;
};

/**
 * Agrège les sondes de 24 h en tranches de 15 minutes.
 * Les valeurs en mémoire écrasent celles de la base (même point de mesure).
 */
const buildHistory = async () => {
  const bucketMs = BUCKET_MINUTES * 60 * 1000;
  const bucketCount = Math.round((WINDOW_HOURS * 60) / BUCKET_MINUTES);
  const end = Math.ceil(Date.now() / bucketMs) * bucketMs;
  const start = end - bucketCount * bucketMs;

  const merged = await collectProbes(new Date(start).toISOString());

  const raw = Array.from({ length: bucketCount }, (_, index) => ({
    startMs: start + index * bucketMs,
    up: 0,
    down: 0,
    latencySum: 0,
    latencyCount: 0,
  }));

  merged.forEach((probe) => {
    const ts = new Date(probe.checkedAt).getTime();
    if (Number.isNaN(ts) || ts < start || ts >= end) return;
    const index = Math.min(bucketCount - 1, Math.floor((ts - start) / bucketMs));
    const bucket = raw[index];
    if (probe.up) {
      bucket.up += 1;
      if (typeof probe.latencyMs === 'number' && Number.isFinite(probe.latencyMs)) {
        bucket.latencySum += probe.latencyMs;
        bucket.latencyCount += 1;
      }
    } else {
      bucket.down += 1;
    }
  });

  let totalUp = 0;
  let totalDown = 0;
  let latencySum = 0;
  let latencyCount = 0;

  const buckets = raw.map((bucket) => {
    const total = bucket.up + bucket.down;
    totalUp += bucket.up;
    totalDown += bucket.down;
    latencySum += bucket.latencySum;
    latencyCount += bucket.latencyCount;

    let status = 'unknown';
    if (total > 0) {
      if (bucket.down === 0) status = 'up';
      else if (bucket.up === 0) status = 'down';
      else status = 'partial';
    }

    return {
      start: new Date(bucket.startMs).toISOString(),
      end: new Date(bucket.startMs + bucketMs).toISOString(),
      up: bucket.up,
      down: bucket.down,
      total,
      latencyMs: bucket.latencyCount > 0
        ? Math.round(bucket.latencySum / bucket.latencyCount)
        : null,
      status,
    };
  });

  const checks = totalUp + totalDown;

  return {
    windowHours: WINDOW_HOURS,
    bucketMinutes: BUCKET_MINUTES,
    buckets,
    checks,
    downChecks: totalDown,
    uptimePct: checks > 0 ? Math.round((totalUp / checks) * 1000) / 10 : null,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
  };
};

const probeOnce = async () => {
  const started = Date.now();
  try {
    await q('SELECT 1');
    await recordProbe({ up: true, latencyMs: Date.now() - started });
  } catch {
    await recordProbe({ up: false, latencyMs: null });
  }
};

const stoppers = [];

/** Démarre la sonde interne (60 s) et l'évaluation des alertes (5 min). */
const startProbing = () => {
  const probeTimer = setInterval(() => { void probeOnce(); }, PROBE_INTERVAL_MS);
  if (typeof probeTimer.unref === 'function') probeTimer.unref();
  void probeOnce();

  stoppers.push(() => clearInterval(probeTimer));
  stoppers.push(startAlertEvaluation());

  return stopProbing;
};

const stopProbing = () => {
  while (stoppers.length > 0) {
    const stop = stoppers.pop();
    try {
      stop();
    } catch {
      /* rien à faire à l'arrêt */
    }
  }
};

module.exports = {
  recordProbe,
  buildHistory,
  startProbing,
  stopProbing,
  WINDOW_HOURS,
  BUCKET_MINUTES,
};