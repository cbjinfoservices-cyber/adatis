const express = require('express');
const { q } = require('../db');

const router = express.Router();

const KIND_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

const toAdapter = (row) => ({
  kind: row.kind,
  name: row.name,
  icon: row.icon,
  description: { fr: row.description_fr || '', en: row.description_en || '' },
});

router.get('/adapters', async (_req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM adapters ORDER BY name');
    const counts = await q(
      'SELECT kind, count(*)::int AS n FROM connectors GROUP BY kind',
    );
    const usage = new Map(counts.rows.map((row) => [row.kind, Number(row.n)]));
    res.json(rows.map((row) => ({ ...toAdapter(row), connectors: usage.get(row.kind) || 0 })));
  } catch (err) { next(err); }
});

router.post('/adapters', async (req, res, next) => {
  try {
    const {
      kind, name, icon = 'ri-plug-line', descriptionFr = '', descriptionEn = '',
    } = req.body || {};
    const cleanKind = String(kind || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();

    if (!KIND_PATTERN.test(cleanKind)) return res.status(400).json({ error: 'invalid_kind' });
    if (!cleanName) return res.status(400).json({ error: 'name_required' });

    const exists = await q('SELECT 1 FROM adapters WHERE kind = $1', [cleanKind]);
    if (exists.rows.length) return res.status(409).json({ error: 'adapter_exists' });

    const { rows } = await q(
      `INSERT INTO adapters (kind, name, icon, description_fr, description_en)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [cleanKind, cleanName, String(icon), String(descriptionFr), String(descriptionEn)],
    );
    return res.status(201).json({ ...toAdapter(rows[0]), connectors: 0 });
  } catch (err) { return next(err); }
});

router.patch('/adapters/:kind', async (req, res, next) => {
  try {
    const current = await q('SELECT * FROM adapters WHERE kind = $1', [req.params.kind]);
    if (!current.rows.length) return res.status(404).json({ error: 'adapter_not_found' });

    const { name, icon, descriptionFr, descriptionEn } = req.body || {};
    const params = [];
    const sets = [];

    if (typeof name === 'string' && name.trim()) {
      params.push(name.trim());
      sets.push(`name = $${params.length}`);
    }
    if (typeof icon === 'string' && icon.trim()) {
      params.push(icon.trim());
      sets.push(`icon = $${params.length}`);
    }
    if (typeof descriptionFr === 'string') {
      params.push(descriptionFr);
      sets.push(`description_fr = $${params.length}`);
    }
    if (typeof descriptionEn === 'string') {
      params.push(descriptionEn);
      sets.push(`description_en = $${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });

    params.push(req.params.kind);
    const { rows } = await q(
      `UPDATE adapters SET ${sets.join(', ')} WHERE kind = $${params.length} RETURNING *`,
      params,
    );
    const usage = await q(
      'SELECT count(*)::int AS n FROM connectors WHERE kind = $1',
      [req.params.kind],
    );
    return res.json({ ...toAdapter(rows[0]), connectors: Number(usage.rows[0].n) });
  } catch (err) { return next(err); }
});

router.delete('/adapters/:kind', async (req, res, next) => {
  try {
    const used = await q(
      'SELECT count(*)::int AS n FROM connectors WHERE kind = $1',
      [req.params.kind],
    );
    if (Number(used.rows[0].n) > 0) {
      return res.status(409).json({
        error: 'adapter_in_use',
        connectors: Number(used.rows[0].n),
      });
    }

    const { rowCount } = await q('DELETE FROM adapters WHERE kind = $1', [req.params.kind]);
    if (!rowCount) return res.status(404).json({ error: 'adapter_not_found' });
    return res.status(204).end();
  } catch (err) { return next(err); }
});

module.exports = router;