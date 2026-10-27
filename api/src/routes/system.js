const express = require('express');
const { q } = require('../db');
const { recordProbe, buildHistory } = require('../healthMonitor');
const { getSettings, updateSettings, normalizeEmail } = require('../settings');
const { recentAlerts, lastHourWindow, emailConfigured } = require('../alerts');
const { statsForWindow } = require('../probeStore');
const pkg = require('../../package.json');
const audit = require('../audit');
const { requireRole } = require('../auth');

const router = express.Router();

const API_VERSION = pkg.version || '1.0.0';
const STARTED_AT = Date.now();
const uptimeSec = () => Math.round((Date.now() - STARTED_AT) / 1000);

const pingDatabase = async () => {
  const started = Date.now();
  await q('SELECT 1');
  return Date.now() - started;
};

const publicSettings = (settings) => ({
  retentionDays: settings.retentionDays,
  alertThresholdPct: settings.alertThresholdPct,
  alertEmail: settings.alertEmail,
  alertsEnabled: settings.alertsEnabled,
  emailConfigured: emailConfigured(),
});

/** Dernière heure complète, pour la carte d'alertes. */
const lastHourSummary = async () => {
  const { start, end } = lastHourWindow();
  const stats = await statsForWindow(start, end);
  return {
    windowStart: stats.windowStart,
    windowEnd: stats.windowEnd,
    uptimePct: stats.uptimePct,
    checks: stats.checks,
    downChecks: stats.downChecks,
    avgLatencyMs: stats.avgLatencyMs,
  };
};

/**
 * Sonde légère utilisée par le bandeau du portail : uniquement l'état de
 * l'API et de PostgreSQL, aucune donnée métier.
 */
router.get('/system/health', async (_req, res) => {
  const checkedAt = new Date().toISOString();
  try {
    const latencyMs = await pingDatabase();
    void recordProbe({ up: true, latencyMs });
    res.json({
      status: 'ok',
      database: 'up',
      latencyMs,
      apiVersion: API_VERSION,
      uptimeSec: uptimeSec(),
      checkedAt,
    });
  } catch (err) {
    void recordProbe({ up: false, latencyMs: null });
    res.status(503).json({
      status: 'degraded',
      database: 'down',
      latencyMs: null,
      apiVersion: API_VERSION,
      uptimeSec: uptimeSec(),
      checkedAt,
      // Sonde publique : aucun détail interne en production.
      ...(process.env.NODE_ENV === 'production' ? {} : { error: err.message }),
    });
  }
});

/**
 * Vue complète pour la page Système : métadonnées API, base de données,
 * migrations appliquées, historiques et réglages de supervision.
 * Aucune colonne sensible n'est lue.
 */
router.get('/system', async (_req, res) => {
  const checkedAt = new Date().toISOString();
  const api = {
    version: API_VERSION,
    uptimeSec: uptimeSec(),
    node: process.version,
    env: process.env.NODE_ENV || 'production',
    startedAt: new Date(STARTED_AT).toISOString(),
  };

  const settings = await getSettings();
  const alerts = await recentAlerts();
  const lastHour = await lastHourSummary();

  try {
    const latencyMs = await pingDatabase();
    void recordProbe({ up: true, latencyMs });

    const infoResult = await q(
      `SELECT current_database() AS name,
              version() AS version,
              pg_database_size(current_database()) AS size_bytes,
              (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections`,
    );
    const info = infoResult.rows[0] || {};

    let migrations = [];
    const registry = await q("SELECT to_regclass('public.schema_migrations') AS ref");
    if (registry.rows[0] && registry.rows[0].ref) {
      const migrationsResult = await q(
        'SELECT version, applied_at FROM schema_migrations ORDER BY applied_at, version',
      );
      migrations = migrationsResult.rows.map((row) => ({
        version: row.version,
        applied_at: row.applied_at instanceof Date ? row.applied_at.toISOString() : row.applied_at,
      }));
    }

    const tablesResult = await q(
      `SELECT relname AS name, n_live_tup::bigint AS rows
         FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY relname`,
    );
    const tables = tablesResult.rows.map((row) => ({
      name: row.name,
      rows: Number(row.rows || 0),
    }));

    return res.json({
      status: 'ok',
      checkedAt,
      api,
      database: {
        status: 'up',
        name: info.name || null,
        version: info.version || null,
        sizeBytes: info.size_bytes === null || info.size_bytes === undefined
          ? null
          : Number(info.size_bytes),
        connections: info.connections === null || info.connections === undefined
          ? null
          : Number(info.connections),
        latencyMs,
        error: null,
      },
      migrations,
      tables,
      history: await buildHistory(),
      settings: publicSettings(settings),
      alerts,
      lastHour,
    });
  } catch (err) {
    void recordProbe({ up: false, latencyMs: null });
    return res.json({
      status: 'degraded',
      checkedAt,
      api,
      database: { status: 'down', name: null, version: null, sizeBytes: null, connections: null, latencyMs: null, error: err.message },
      migrations: [],
      tables: [],
      history: await buildHistory(),
      settings: publicSettings(settings),
      alerts,
      lastHour,
    });
  }
});

/**
 * Réglages de supervision : rétention des sondes, seuil d'alerte,
 * destinataire et activation des emails.
 * PATCH partiel : seules les clés envoyées sont enregistrées.
 */
router.patch('/system/settings', async (req, res) => {
  const body = req.body || {};
  const allowed = ['retentionDays', 'alertThresholdPct', 'alertEmail', 'alertsEnabled'];
  const provided = allowed.filter((key) => body[key] !== undefined);

  if (provided.length === 0) {
    return res.status(400).json({ error: 'invalid_settings', message: 'Aucun réglage fourni.' });
  }

  if (body.retentionDays !== undefined) {
    const days = Number(body.retentionDays);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      return res.status(400).json({ error: 'invalid_settings', message: 'La rétention doit être comprise entre 1 et 90 jours.' });
    }
  }

  if (body.alertThresholdPct !== undefined) {
    const threshold = Number(body.alertThresholdPct);
    if (!Number.isFinite(threshold) || threshold < 50 || threshold > 100) {
      return res.status(400).json({ error: 'invalid_settings', message: 'Le seuil doit être compris entre 50 et 100 %.' });
    }
  }

  if (body.alertEmail !== undefined && body.alertEmail !== null && body.alertEmail !== '') {
    if (!normalizeEmail(body.alertEmail)) {
      return res.status(400).json({ error: 'invalid_settings', message: 'Adresse email invalide.' });
    }
  }

  if (body.alertsEnabled !== undefined && typeof body.alertsEnabled !== 'boolean') {
    return res.status(400).json({ error: 'invalid_settings', message: 'Valeur invalide pour l\'activation des alertes.' });
  }

  try {
    const patch = { ...body };
    if (patch.alertEmail === '') patch.alertEmail = null;
    const settings = await updateSettings(patch);
    return res.json({ settings: publicSettings(settings) });
  } catch (err) {
    return res.status(503).json({ error: 'settings_unavailable', message: err.message });
  }
});

/** Journal d'audit, le plus récent d'abord (`before` = id de pagination). */
router.get('/system/audit', requireRole('admin'), async (req, res, next) => {
  try {
    res.json(await audit.list({ limit: req.query.limit, before: req.query.before }));
  } catch (err) { next(err); }
});

/** Vérifie la chaîne d'empreintes : toute ligne altérée ou retirée est signalée. */
router.get('/system/audit/verify', requireRole('admin'), async (_req, res, next) => {
  try {
    res.json(await audit.verify());
  } catch (err) { next(err); }
});

module.exports = router;