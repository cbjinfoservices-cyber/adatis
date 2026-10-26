const express = require('express');
const { q, withTransaction } = require('../db');
const m = require('../mappers');
const ascender = require('../ascenderConnector');
const { probeEndpoint } = require('../endpointProbe');

const router = express.Router();

async function hydrate(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [tests, checks, history, catalog] = await Promise.all([
    q('SELECT * FROM connector_tests WHERE connector_id = ANY($1) ORDER BY at DESC', [ids]),
    q('SELECT * FROM connector_checks WHERE connector_id = ANY($1) ORDER BY sort_order', [ids]),
    q('SELECT * FROM connector_history WHERE connector_id = ANY($1) ORDER BY at DESC', [ids]),
    q('SELECT * FROM connector_catalog WHERE connector_id = ANY($1) ORDER BY name_fr', [ids]),
  ]);

  const group = (list) => {
    const map = new Map();
    list.forEach((item) => {
      if (!map.has(item.connector_id)) map.set(item.connector_id, []);
      map.get(item.connector_id).push(item);
    });
    return map;
  };

  const testsBy = group(tests.rows);
  const checksBy = group(checks.rows);
  const historyBy = group(history.rows);
  const catalogBy = group(catalog.rows);

  const connectors = rows.map((row) => m.connector(row, {
    tests: (testsBy.get(row.id) || []).slice(0, 10).map((t) => ({
      at: t.at instanceof Date ? t.at.toISOString() : t.at,
      ok: t.ok,
      latency: Number(t.latency),
      error: t.error,
    })),
    checks: (checksBy.get(row.id) || []).map((c) => ({
      label: { fr: c.label_fr, en: c.label_en },
      ok: c.ok,
    })),
    history: (historyBy.get(row.id) || []).slice(0, 10).map((h) => ({
      at: h.at instanceof Date ? h.at.toISOString() : h.at,
      author: h.author,
      field: h.field,
      before: h.before_value,
      after: h.after_value,
    })),
    catalog: (catalogBy.get(row.id) || []).map((c) => ({
      id: c.id,
      name: { fr: c.name_fr, en: c.name_en },
      engineRef: c.engine_ref,
      category: c.category_id,
      status: c.status,
      lastSync: c.last_sync instanceof Date ? c.last_sync.toISOString() : c.last_sync,
    })),
  }));

  // Connecteur Ascender : valeurs réelles à la place des champs stockés.
  return ascender.overlayAll(rows, connectors);
}

router.get('/batch-tests', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 3, 50);
    const { rows } = await q('SELECT * FROM batch_tests ORDER BY at DESC LIMIT $1', [limit]);
    res.json(rows.map(m.batchTest));
  } catch (err) { next(err); }
});

/**
 * Test réel d'un connecteur, enregistré dans connector_tests : ping Ascender
 * pour le connecteur géré, joignabilité de l'URL pour les autres.
 */
async function testConnector(row) {
  if (ascender.isManaged(row)) return ascender.runTest(row.id);

  const result = await probeEndpoint(row.endpoint);
  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO connector_tests (connector_id, at, ok, latency, error) VALUES ($1, now(), $2, $3, $4)',
      [row.id, result.ok, result.latency, result.error],
    );
    await client.query(
      `UPDATE connectors
          SET latency_ms = $1, health = $2,
              retest_required_at = CASE WHEN $3 THEN NULL ELSE retest_required_at END
        WHERE id = $4`,
      [result.latency, result.health, result.ok, row.id],
    );
  });
  return result;
}

router.post('/connectors/batch-test', async (_req, res, next) => {
  try {
    const started = Date.now();
    const targets = await q(
      `SELECT * FROM connectors
       WHERE retest_required_at IS NOT NULL AND (configured = true OR managed = true)
       ORDER BY name`,
    );

    if (!targets.rows.length) {
      return res.json({ skipped: true, total: 0, ok: 0, failed: 0, avgLatencyMs: 0, durationMs: 0 });
    }

    const results = await Promise.all(targets.rows.map(async (target) => {
      const result = await testConnector(target);
      return { id: target.id, ok: result.ok, latency: result.latency };
    }));

    const ok = results.filter((r) => r.ok);
    const summary = {
      total: results.length,
      ok: ok.length,
      failed: results.length - ok.length,
      avgLatencyMs: ok.length ? Math.round(ok.reduce((n, r) => n + r.latency, 0) / ok.length) : 0,
      durationMs: Date.now() - started,
    };

    const { rows } = await q(
      `INSERT INTO batch_tests (at, total, ok, failed, avg_latency_ms, duration_ms)
       VALUES (now(), $1, $2, $3, $4, $5) RETURNING *`,
      [summary.total, summary.ok, summary.failed, summary.avgLatencyMs, summary.durationMs],
    );

    return res.json({ ...m.batchTest(rows[0]), skipped: false });
  } catch (err) { return next(err); }
});

router.get('/connectors', async (_req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM connectors ORDER BY name');
    res.json(await hydrate(rows));
  } catch (err) { next(err); }
});

router.get('/connectors/:id', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'connector_not_found' });
    const [connector] = await hydrate(rows);
    return res.json(connector);
  } catch (err) { return next(err); }
});

router.post('/connectors', async (req, res, next) => {
  try {
    const {
      kind, name, endpoint = '', endpointDefault, authMode = 'À renseigner', version = '',
      notes = '', scope = 'tenant', capabilities = [], configured,
    } = req.body || {};
    if (!kind || !name) return res.status(400).json({ error: 'kind_and_name_required' });

    const adapter = await q('SELECT * FROM adapters WHERE kind = $1', [kind]);
    if (!adapter.rows.length) return res.status(400).json({ error: 'unknown_adapter' });

    // Un seul connecteur Ascender : celui configuré par les variables AWX_*.
    const managed = kind === ascender.KIND;
    if (managed) {
      const exists = await q('SELECT 1 FROM connectors WHERE kind = $1', [kind]);
      if (exists.rows.length) return res.status(409).json({ error: 'connector_exists' });
    }

    const count = await q('SELECT count(*)::int AS n FROM connectors');
    const id = `cn-${kind.slice(0, 3)}-${String(count.rows[0].n + 1).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
    const cleanEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
    const defaultEndpoint = (typeof endpointDefault === 'string' && endpointDefault.trim()) || cleanEndpoint || '—';
    const isConfigured = typeof configured === 'boolean'
      ? configured
      : Boolean(cleanEndpoint && cleanEndpoint !== '—');
    const caps = Array.isArray(capabilities)
      ? capabilities.filter((value) => typeof value === 'string')
      : [];

    const { rows } = await q(
      `INSERT INTO connectors (id, kind, name, endpoint, endpoint_default, auth_mode, version,
                               notes, configured, health, latency_ms, uptime, last_sync, jobs_24h,
                               success_rate, scope, capabilities, managed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',0,0,NULL,0,0,$10,$11,$12)
       RETURNING *`,
      [id, kind, name, cleanEndpoint || '—', defaultEndpoint, authMode, version, notes, isConfigured, scope, caps, managed],
    );

    await q(
      `INSERT INTO connector_checks (connector_id, label_fr, label_en, ok, sort_order)
       VALUES ($1, 'Authentification', 'Authentication', false, 0),
              ($1, 'Certificat TLS', 'TLS certificate', $2, 1)`,
      [id, defaultEndpoint.startsWith('https://')],
    );

    return res.status(201).json((await hydrate(rows))[0]);
  } catch (err) { return next(err); }
});

router.patch('/connectors/:id/catalog/:itemId', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['mapped', 'review', 'ignored'].includes(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    const { rowCount } = await q(
      'UPDATE connector_catalog SET status = $1 WHERE id = $2 AND connector_id = $3',
      [status, req.params.itemId, req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: 'catalog_item_not_found' });

    const { rows } = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'connector_not_found' });
    return res.json((await hydrate(rows))[0]);
  } catch (err) { return next(err); }
});

router.patch('/connectors/:id', async (req, res, next) => {
  try {
    const { name, endpoint, notes, author = 'Camille Laurent' } = req.body || {};
    const current = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'connector_not_found' });

    const before = current.rows[0];
    const changes = [];
    const params = [];
    const history = [];

    if (typeof name === 'string' && name.trim() && name !== before.name) {
      params.push(name.trim());
      changes.push(`name = $${params.length}`);
      history.push({ field: 'name', from: before.name, to: name.trim() });
    }
    // L'URL d'Ascender vient de AWX_BASE_URL : elle ne se modifie pas ici.
    if (!ascender.isManaged(before)
      && typeof endpoint === 'string' && endpoint.trim() && endpoint !== before.endpoint) {
      params.push(endpoint.trim());
      changes.push(`endpoint = $${params.length}`);
      history.push({ field: 'endpoint', from: before.endpoint, to: endpoint.trim() });
    }
    if (typeof notes === 'string' && notes !== before.notes) {
      params.push(notes);
      changes.push(`notes = $${params.length}`);
      history.push({ field: 'notes', from: before.notes, to: notes });
    }

    if (!changes.length) return res.json((await hydrate(current.rows))[0]);

    params.push(req.params.id);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE connectors SET ${changes.join(', ')}, retest_required_at = now() WHERE id = $${params.length}`,
        params,
      );
      for (const change of history) {
        await client.query(
          `INSERT INTO connector_history (connector_id, at, author, field, before_value, after_value)
           VALUES ($1, now(), $2, $3, $4, $5)`,
          [req.params.id, author, change.field, change.from, change.to],
        );
      }
    });

    const { rows } = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    return res.json((await hydrate(rows))[0]);
  } catch (err) { return next(err); }
});

router.delete('/connectors/:id', async (req, res, next) => {
  try {
    const current = await q('SELECT managed FROM connectors WHERE id = $1', [req.params.id]);
    if (ascender.isManaged(current.rows[0])) return res.status(409).json({ error: 'connector_managed' });

    const { rowCount } = await q('DELETE FROM connectors WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'connector_not_found' });
    return res.status(204).end();
  } catch (err) { return next(err); }
});

router.post('/connectors/:id/test', async (req, res, next) => {
  try {
    const current = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'connector_not_found' });

    // Test réel côté serveur : aucun résultat n'est accepté du navigateur.
    await testConnector(current.rows[0]);

    const { rows } = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    return res.json((await hydrate(rows))[0]);
  } catch (err) { return next(err); }
});

router.post('/connectors/:id/sync', async (req, res, next) => {
  try {
    const current = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'connector_not_found' });

    // Ascender : import des modèles visibles avec le jeton de l'utilisateur.
    if (ascender.isManaged(current.rows[0])) {
      if (!req.auth?.session) return res.status(409).json({ error: 'ascender_session_required' });
      try {
        await ascender.syncCatalog({ connectorId: req.params.id, session: req.auth.session });
      } catch (err) {
        if (err.code === 'ascender_session_required') return res.status(409).json({ error: err.code });
        console.error('[ascender] import du catalogue impossible :', err.message);
        return res.status(502).json({ error: 'ascender_unreachable', message: err.message });
      }
      const { rows } = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
      return res.json((await hydrate(rows))[0]);
    }

    await q(
      `UPDATE connectors SET last_sync = now(), health = CASE WHEN configured THEN 'healthy' ELSE health END
       WHERE id = $1`,
      [req.params.id],
    );
    await q('UPDATE connector_catalog SET last_sync = now() WHERE connector_id = $1', [req.params.id]);

    const { rows } = await q('SELECT * FROM connectors WHERE id = $1', [req.params.id]);
    return res.json((await hydrate(rows))[0]);
  } catch (err) { return next(err); }
});

module.exports = router;