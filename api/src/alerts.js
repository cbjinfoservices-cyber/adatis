const { q } = require('./db');
const { getSettings } = require('./settings');
const { statsForWindow } = require('./probeStore');
const { sendEmail, emailConfigured } = require('./mailer');

/**
 * Alertes de disponibilité.
 *
 * Toutes les 5 minutes, on calcule la disponibilité de la dernière heure
 * complète. Si elle passe sous le seuil (99 % par défaut), un email est envoyé
 * au destinataire configuré. La contrainte d'unicité sur window_start garantit
 * un seul email par heure, même avec plusieurs réplicas de l'API.
 */

const HOUR_MS = 60 * 60 * 1000;
const EVAL_INTERVAL_MS = 5 * 60 * 1000;
const MIN_CHECKS = 2;

/** Dernière heure complète (bornes alignées sur l'heure pleine). */
const lastHourWindow = () => {
  const end = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  return {
    start: new Date(end - HOUR_MS).toISOString(),
    end: new Date(end).toISOString(),
  };
};

const mapAlert = (row) => ({
  id: Number(row.id),
  windowStart: row.window_start instanceof Date ? row.window_start.toISOString() : String(row.window_start),
  windowEnd: row.window_end instanceof Date ? row.window_end.toISOString() : String(row.window_end),
  uptimePct: Number(row.uptime_pct),
  thresholdPct: Number(row.threshold_pct),
  checks: Number(row.checks),
  downChecks: Number(row.down_checks),
  recipient: row.recipient || null,
  emailSent: Boolean(row.email_sent),
  emailError: row.email_error || null,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
});

const recentAlerts = async (limit = 15) => {
  try {
    const result = await q(
      `SELECT id, window_start, window_end, uptime_pct, threshold_pct, checks, down_checks,
              recipient, email_sent, email_error, created_at
         FROM health_alerts
        ORDER BY window_start DESC
        LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapAlert);
  } catch {
    return [];
  }
};

const buildEmail = (alert, settings) => {
  const portal = (process.env.PORTAL_URL || '').trim();
  const format = (iso) => new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const subject = `[ASP] Disponibilité sous ${settings.alertThresholdPct} % sur la dernière heure`;
  const lines = [
    `La disponibilité de la plateforme est passée sous le seuil surveillé.`,
    '',
    `Fenêtre       : ${format(alert.windowStart)} → ${format(alert.windowEnd)}`,
    `Disponibilité : ${alert.uptimePct.toFixed(1)} % (seuil ${settings.alertThresholdPct} %)`,
    `Sondes        : ${alert.checks} dont ${alert.downChecks} en échec`,
    '',
    `Ouvrez la page Système du portail pour le détail de la latence et des migrations.`,
  ];
  if (portal) lines.push('', `Portail : ${portal.replace(/\/+$/, '')}/admin/system`);
  lines.push('', 'Email automatique envoyé par la supervision du portail ASP.');

  return { subject, text: lines.join('\n') };
};

/**
 * Évalue la dernière heure complète. Renvoie l'alerte créée, ou null si rien
 * à signaler (disponibilité correcte, alertes désactivées, déjà notifiée).
 */
const evaluateAlerts = async () => {
  const settings = await getSettings();
  if (!settings.alertsEnabled) return null;

  const { start, end } = lastHourWindow();
  const stats = await statsForWindow(start, end);
  if (stats.checks < MIN_CHECKS) return null;
  if (stats.uptimePct === null) return null;
  if (stats.uptimePct >= settings.alertThresholdPct) return null;

  let inserted;
  try {
    inserted = await q(
      `INSERT INTO health_alerts
         (window_start, window_end, uptime_pct, threshold_pct, checks, down_checks, recipient)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (window_start) DO NOTHING
       RETURNING id, window_start, window_end, uptime_pct, threshold_pct, checks, down_checks,
                 recipient, email_sent, email_error, created_at`,
      [
        start,
        end,
        stats.uptimePct,
        settings.alertThresholdPct,
        stats.checks,
        stats.downChecks,
        settings.alertEmail,
      ],
    );
  } catch {
    /* Pas de table d'alertes : on n'essaie pas d'envoyer d'email sans trace. */
    return null;
  }

  if (inserted.rowCount === 0) return null;
  const alert = mapAlert(inserted.rows[0]);

  const { subject, text } = buildEmail(alert, settings);
  const result = settings.alertEmail
    ? await sendEmail({ to: settings.alertEmail, subject, text })
    : { sent: false, error: 'recipient_missing' };

  try {
    await q(
      'UPDATE health_alerts SET email_sent = $2, email_error = $3 WHERE id = $1',
      [alert.id, result.sent, result.error],
    );
  } catch {
    /* Trace best effort : l'alerte existe déjà. */
  }

  return { ...alert, emailSent: result.sent, emailError: result.error };
};

/** Démarre l'évaluation périodique et renvoie la fonction d'arrêt. */
const startAlertEvaluation = () => {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    evaluateAlerts()
      .catch(() => {})
      .finally(() => { running = false; });
  };

  const initial = setTimeout(tick, 20000);
  if (typeof initial.unref === 'function') initial.unref();

  const timer = setInterval(tick, EVAL_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
};

module.exports = {
  evaluateAlerts,
  startAlertEvaluation,
  recentAlerts,
  lastHourWindow,
  emailConfigured,
};