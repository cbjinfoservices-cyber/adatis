const { q, withTransaction } = require('./db');
const awx = require('./awx');
const { ensureAccessToken } = require('./auth');

/**
 * Connecteur Ascender (distribution d'AWX) : le seul connecteur réel du portail.
 *
 * Sa configuration est celle du SSO et du lancement des jobs (variables AWX_*) :
 * la ligne `connectors` correspondante (managed = true) ne conserve que le nom,
 * les notes, l'historique des tests et le catalogue importé. L'URL, l'état de
 * configuration, les contrôles et les volumes de jobs sont calculés en direct.
 */

const KIND = 'ascender';

const isManaged = (row) => Boolean(row?.managed);

const apiEndpoint = () => {
  const { baseUrl } = awx.readConfig();
  return baseUrl ? `${baseUrl}/api/v2/` : '—';
};

/** Jobs lancés par le portail sur les dernières 24 h (table requests). */
const jobStats = async () => {
  const { rows } = await q(
    `SELECT count(*)::int AS jobs,
            count(*) FILTER (WHERE status = 'success')::int AS ok,
            count(*) FILTER (WHERE status IN ('success', 'failed', 'canceled'))::int AS done
       FROM requests
      WHERE awx_job_id IS NOT NULL
        AND awx_started_at > now() - interval '24 hours'`,
  );
  const row = rows[0] || {};
  return {
    jobs24h: Number(row.jobs || 0),
    successRate: row.done ? Math.round((Number(row.ok) / Number(row.done)) * 1000) / 10 : 0,
  };
};

/** Remplace les champs simulés d'un connecteur géré par les valeurs réelles. */
const overlay = (connector, stats) => {
  const config = awx.readConfig();
  const configured = Boolean(config.baseUrl);
  const lastTest = connector.tests[0] || null;
  const okTests = connector.tests.filter((entry) => entry.ok).length;

  return {
    ...connector,
    managed: true,
    endpoint: apiEndpoint(),
    endpointDefault: apiEndpoint(),
    configured,
    authMode: 'OAuth2 · jeton de chaque utilisateur',
    health: configured ? connector.health : 'pending',
    uptime: connector.tests.length
      ? Math.round((okTests / connector.tests.length) * 1000) / 10
      : 0,
    jobs24h: stats.jobs24h,
    successRate: stats.successRate,
    checks: [
      {
        label: { fr: 'URL Ascender (AWX_BASE_URL)', en: 'Ascender URL (AWX_BASE_URL)' },
        ok: configured,
      },
      {
        label: { fr: 'Application OAuth2 (client id + secret)', en: 'OAuth2 application (client id + secret)' },
        ok: Boolean(config.clientId && config.clientSecret),
      },
      {
        label: { fr: 'Certificat TLS (HTTPS)', en: 'TLS certificate (HTTPS)' },
        ok: config.baseUrl.startsWith('https://'),
      },
      {
        label: { fr: 'API /api/v2/ping joignable', en: '/api/v2/ping reachable' },
        ok: Boolean(lastTest?.ok),
      },
    ],
  };
};

/** Applique overlay() aux connecteurs gérés d'une liste déjà hydratée. */
const overlayAll = async (rows, connectors) => {
  const managedIds = new Set(rows.filter(isManaged).map((row) => row.id));
  if (!managedIds.size) return connectors;
  const stats = await jobStats();
  return connectors.map((connector) => (
    managedIds.has(connector.id) ? overlay(connector, stats) : connector
  ));
};

/** Test réel : ping de l'API Ascender, enregistré dans connector_tests. */
const runTest = async (connectorId) => {
  const configured = Boolean(awx.readConfig().baseUrl);
  let result;
  try {
    const pong = await awx.ping();
    result = { ok: true, latency: pong.latencyMs, error: null, version: pong.version };
  } catch (err) {
    result = { ok: false, latency: 0, error: String(err.message || err).slice(0, 300), version: '' };
  }

  let health = 'pending';
  if (configured) health = result.ok ? 'healthy' : 'down';

  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO connector_tests (connector_id, at, ok, latency, error) VALUES ($1, now(), $2, $3, $4)',
      [connectorId, result.ok, result.latency, result.error],
    );
    await client.query(
      `UPDATE connectors
          SET latency_ms = $1, health = $2,
              version = COALESCE(NULLIF($3, ''), version),
              retest_required_at = CASE WHEN $4 THEN NULL ELSE retest_required_at END
        WHERE id = $5`,
      [result.latency, health, result.version, result.ok, connectorId],
    );
  });
  return result;
};

/**
 * Importe les job templates et workflow templates visibles avec le jeton de
 * l'utilisateur. Un modèle affecté à un service est toujours « publié » ; les
 * autres gardent leur statut précédent, ou « à revoir » s'ils sont nouveaux.
 */
const syncCatalog = async ({ connectorId, session }) => {
  const token = await ensureAccessToken(session);
  if (!token) {
    const error = new Error('Jeton Ascender indisponible');
    error.code = 'ascender_session_required';
    throw error;
  }

  const { templates, workflows } = await awx.listTemplatesDetailed(token);
  const [existing, services] = await Promise.all([
    q('SELECT id, status FROM connector_catalog WHERE connector_id = $1', [connectorId]),
    q('SELECT awx_job_template_id, awx_workflow_job_template_id FROM services'),
  ]);

  const previous = new Map(existing.rows.map((row) => [row.id, row.status]));
  const usedJobs = new Set(services.rows.map((row) => Number(row.awx_job_template_id)).filter(Boolean));
  const usedWorkflows = new Set(services.rows.map((row) => Number(row.awx_workflow_job_template_id)).filter(Boolean));

  const items = [
    ...templates.map((tpl) => ({ ...tpl, ref: `job_template/${tpl.id}`, used: usedJobs.has(tpl.id) })),
    ...workflows.map((tpl) => ({ ...tpl, ref: `workflow_job_template/${tpl.id}`, used: usedWorkflows.has(tpl.id) })),
  ];

  await withTransaction(async (client) => {
    await client.query('DELETE FROM connector_catalog WHERE connector_id = $1', [connectorId]);
    for (const item of items) {
      const id = `${connectorId}:${item.ref}`;
      const status = item.used ? 'mapped' : previous.get(id) || 'review';
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO connector_catalog
           (id, connector_id, name_fr, name_en, engine_ref, category_id, status, last_sync)
         VALUES ($1, $2, $3, $3, $4, NULL, $5, now())`,
        [id, connectorId, item.name.slice(0, 200), item.ref, status],
      );
    }
    await client.query('UPDATE connectors SET last_sync = now() WHERE id = $1', [connectorId]);
  });

  return { count: items.length };
};

module.exports = {
  KIND,
  isManaged,
  overlayAll,
  runTest,
  syncCatalog,
};
