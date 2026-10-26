const { q } = require('./db');

/**
 * Stockage des sondes de santé.
 *
 * Deux étages : PostgreSQL (table health_probes) et un tampon mémoire dans le
 * processus. Le tampon est indispensable pour les périodes où la base est
 * justement injoignable : l'insertion échoue mais l'incident reste visible
 * dans l'historique et dans le calcul d'alerte.
 */

const MAX_MEMORY_PROBES = 4000;
const memory = [];

const pushMemory = (checkedAt, up, latencyMs) => {
  memory.push({ checkedAt, up, latencyMs });
  if (memory.length > MAX_MEMORY_PROBES) {
    memory.splice(0, memory.length - MAX_MEMORY_PROBES);
  }
};

const getMemoryProbes = () => memory.slice();

const normalizeRow = (row) => ({
  checkedAt: row.checked_at instanceof Date ? row.checked_at.toISOString() : String(row.checked_at),
  up: Boolean(row.database_up),
  latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
});

const readStoredProbes = async (sinceIso) => {
  try {
    const result = await q(
      `SELECT checked_at, database_up, latency_ms
         FROM health_probes
        WHERE checked_at >= $1
        ORDER BY checked_at`,
      [sinceIso],
    );
    return result.rows.map(normalizeRow);
  } catch {
    return [];
  }
};

/**
 * Sondes depuis `sinceIso`, base + mémoire fusionnées.
 * La mémoire écrase la base pour un même horodatage (même point de mesure).
 */
const collectProbes = async (sinceIso) => {
  const since = new Date(sinceIso).getTime();
  const merged = new Map();
  (await readStoredProbes(sinceIso)).forEach((probe) => merged.set(probe.checkedAt, probe));
  memory
    .filter((probe) => new Date(probe.checkedAt).getTime() >= since)
    .forEach((probe) => merged.set(probe.checkedAt, probe));
  return Array.from(merged.values());
};

/** Statistiques agrégées sur une fenêtre [startIso, endIso). */
const statsForWindow = async (startIso, endIso) => {
  const end = new Date(endIso).getTime();
  const probes = (await collectProbes(startIso))
    .filter((probe) => new Date(probe.checkedAt).getTime() < end);

  let up = 0;
  let down = 0;
  let latencySum = 0;
  let latencyCount = 0;

  probes.forEach((probe) => {
    if (probe.up) {
      up += 1;
      if (typeof probe.latencyMs === 'number' && Number.isFinite(probe.latencyMs)) {
        latencySum += probe.latencyMs;
        latencyCount += 1;
      }
    } else {
      down += 1;
    }
  });

  const checks = up + down;

  return {
    windowStart: startIso,
    windowEnd: endIso,
    checks,
    upChecks: up,
    downChecks: down,
    uptimePct: checks > 0 ? Math.round((up / checks) * 1000) / 10 : null,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
  };
};

/** Purge des sondes plus anciennes que `days`. */
const pruneProbes = async (days) => {
  try {
    await q(`DELETE FROM health_probes WHERE checked_at < now() - ($1 || ' days')::interval`, [String(days)]);
  } catch {
    /* Base indisponible : la purge sera retentée plus tard. */
  }
};

module.exports = { pushMemory, getMemoryProbes, collectProbes, statsForWindow, pruneProbes };