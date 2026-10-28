const express = require('express');
const { q } = require('../db');
const m = require('../mappers');
const awxJobs = require('../awxJobs');
const awxRbac = require('../awxRbac');

const router = express.Router();

/**
 * Services proposés à l'utilisateur connecté, chacun avec son projet Ascender.
 *
 * Filtre RBAC : un service n'est proposé que si le job template (ou workflow)
 * AWX associé est réellement accessible, avec le jeton de l'utilisateur. Le
 * même appel (mis en cache) donne le projet de chaque job template. Sans
 * session AWX (auth désactivée ou AWX injoignable) : aucun filtre, aucun projet.
 */
const visibleServices = async (req, rows) => {
  const access = req.auth?.session ? await awxRbac.accessForSession(req.auth.session) : null;
  return rows
    .map((row) => ({ row, template: awxJobs.templateForService(row) }))
    .filter(({ template }) => !access || !template || awxRbac.allowed(access, template.kind, template.id))
    .map(({ row, template }) => ({ row, project: awxRbac.projectOf(access, template) }));
};

const serviceRows = () => q('SELECT * FROM services');

/**
 * Projets Ascender des services visibles, triés par nom. Un projet sans
 * service relié au catalogue n'est pas proposé.
 */
router.get('/projects', async (req, res, next) => {
  try {
    const services = await visibleServices(req, (await serviceRows()).rows);
    const projects = new Map();
    services.forEach(({ project }) => { if (project) projects.set(project.id, project); });
    res.json([...projects.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m.project));
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
    // Le projet vient d'Ascender : le filtre s'applique après sa lecture.
    const wantedProject = String(project || '');
    const services = (await visibleServices(req, rows))
      .filter((s) => !wantedProject || String(s.project?.id || '') === wantedProject);
    res.json(services.map((s) => m.service(s.row, s.project)));
  } catch (err) { next(err); }
});

router.get('/services/:id', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'service_not_found' });

    const [visible] = await visibleServices(req, rows);
    if (!visible) return res.status(403).json({ error: 'service_forbidden' });

    const service = m.service(visible.row, visible.project);
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