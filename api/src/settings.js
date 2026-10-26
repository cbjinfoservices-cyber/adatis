const { q } = require('./db');

/**
 * Réglages de supervision, modifiables depuis la page Système.
 *
 * Les valeurs vivent dans la table system_settings (clé / valeur jsonb), avec
 * un petit cache mémoire de 15 s pour ne pas requêter à chaque sonde.
 * Le destinataire d'alerte peut aussi venir de la variable d'environnement
 * ALERT_EMAIL_TO : la valeur enregistrée en base reste prioritaire.
 */

const KEY_MAP = {
  retentionDays: 'probe_retention_days',
  alertThresholdPct: 'alert_threshold_pct',
  alertEmail: 'alert_email',
  alertsEnabled: 'alerts_enabled',
};

const DEFAULTS = {
  retentionDays: 7,
  alertThresholdPct: 99,
  alertEmail: (process.env.ALERT_EMAIL_TO || '').trim() || null,
  alertsEnabled: true,
};

const TTL_MS = 15 * 1000;

let cache = { ...DEFAULTS };
let loadedAt = 0;

const clampInt = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const clampNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 10) / 10));
};

const normalizeEmail = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? trimmed : null;
};

const readFromDatabase = async () => {
  try {
    const result = await q('SELECT key, value FROM system_settings');
    const map = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
    return {
      retentionDays: clampInt(map[KEY_MAP.retentionDays], DEFAULTS.retentionDays, 1, 90),
      alertThresholdPct: clampNumber(map[KEY_MAP.alertThresholdPct], DEFAULTS.alertThresholdPct, 50, 100),
      alertEmail: normalizeEmail(map[KEY_MAP.alertEmail]) || DEFAULTS.alertEmail,
      alertsEnabled: typeof map[KEY_MAP.alertsEnabled] === 'boolean'
        ? map[KEY_MAP.alertsEnabled]
        : DEFAULTS.alertsEnabled,
    };
  } catch {
    /* Table absente ou base indisponible : on garde les valeurs par défaut. */
    return { ...DEFAULTS };
  }
};

/** Réglages courants. `force` ignore le cache (après une écriture). */
const getSettings = async (force = false) => {
  if (!force && Date.now() - loadedAt < TTL_MS) return cache;
  cache = await readFromDatabase();
  loadedAt = Date.now();
  return cache;
};

const writeSetting = async (key, value) => {
  await q(
    `INSERT INTO system_settings (key, value, updated_at)
          VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
};

/** Écriture partielle : seules les clés fournies sont touchées. */
const updateSettings = async (patch = {}) => {
  const writes = [];

  if (patch.retentionDays !== undefined) {
    const days = clampInt(patch.retentionDays, DEFAULTS.retentionDays, 1, 90);
    writes.push(writeSetting(KEY_MAP.retentionDays, days));
  }
  if (patch.alertThresholdPct !== undefined) {
    const threshold = clampNumber(patch.alertThresholdPct, DEFAULTS.alertThresholdPct, 50, 100);
    writes.push(writeSetting(KEY_MAP.alertThresholdPct, threshold));
  }
  if (patch.alertEmail !== undefined) {
    const email = normalizeEmail(patch.alertEmail);
    writes.push(writeSetting(KEY_MAP.alertEmail, email));
  }
  if (patch.alertsEnabled !== undefined) {
    writes.push(writeSetting(KEY_MAP.alertsEnabled, Boolean(patch.alertsEnabled)));
  }

  await Promise.all(writes);
  return getSettings(true);
};

module.exports = { getSettings, updateSettings, normalizeEmail, DEFAULTS };