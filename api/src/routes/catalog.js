const express = require('express');
const { q } = require('../db');
const m = require('../mappers');
const awxJobs = require('../awxJobs');
const awxRbac = require('../awxRbac');

const router = express.Router();

/**
 * Filtre RBAC : un service n'est proposé que si le job template (ou workflow)
 * AWX associé est réellement accessible à l'utilisateur connecté, avec son
 * propre jeton. Sans session AWX (auth désactivée ou AWX injoignable) on
 * n'applique aucun filtre.
 */
const keepAllowedServices = async (req, rows) => {
  if (!req.auth?.session) return rows;
  const access = await awxRbac.accessForSession(req.auth.session);
  if (!access) return rows;
  return rows.filter((row) => {
    const template = awxJobs.templateForService(row);
    if (!template) return true;
    return awxRbac.allowed(access, template.kind, template.id);
  });
};

router.get('/projects', async (_req, res, next) => {
  try {
    const { rows } = await q('SELECT id, icon FROM projects ORDER BY sort_order');
    res.json(rows.map(m.project));
  } catch (err) { next(err); }
});

router.get('/categories', async (_req, res, next) => {
  try {
    const { rows } = await q('SELECT id, icon FROM categories ORDER BY sort_order');
    res.json(rows.map(m.category));
  } catch (err) { next(err); }
});

router.get('/services', async (req, res, next) => {
  try {
    const { project, category, q: search, sort = 'popular', lang = 'fr' } = req.query;
    const where = [];
    const params = [];

    if (project) {
      params.push(project);
      where.push(`s.project_id = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`s.category_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${String(search).trim()}%`);
      const idx = params.length;
      where.push(`(
        s.name_fr ILIKE $${idx} OR s.name_en ILIKE $${idx}
        OR s.description_fr ILIKE $${idx} OR s.description_en ILIKE $${idx}
        OR array_to_string(s.tags, ' ') ILIKE $${idx}
      )`);
    }

    const column = lang === 'en' ? 's.name_en' : 's.name_fr';
    const orderBy = {
      popular: 's.popularity DESC, s.name_fr ASC',
      fastest: 's.estimated_minutes ASC, s.name_fr ASC',
      az: `${column} ASC`,
    }[sort] || 's.popularity DESC';

    const { rows } = await q(
      `SELECT s.* FROM services s
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${orderBy}`,
      params,
    );
    const allowedRows = await keepAllowedServices(req, rows);
    res.json(allowedRows.map(m.service));
  } catch (err) { next(err); }
});

router.get('/services/:id', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'service_not_found' });

    const allowedRows = await keepAllowedServices(req, rows);
    if (!allowedRows.length) return res.status(403).json({ error: 'service_forbidden' });

    const service = m.service(rows[0]);
    let form = null;
    if (rows[0].form_id) {
      const formRows = await q('SELECT * FROM form_schemas WHERE id = $1', [rows[0].form_id]);
      if (formRows.rows.length) form = m.formSchema(formRows.rows[0]);
    }
    return res.json({ ...service, form });
  } catch (err) { return next(err); }
});

router.get('/form-schemas/:id', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM form_schemas WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'form_not_found' });
    return res.json(m.formSchema(rows[0]));
  } catch (err) { return next(err); }
});

module.exports = router;