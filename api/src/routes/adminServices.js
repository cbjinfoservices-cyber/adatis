const express = require('express');
const { q } = require('../db');
const awx = require('../awx');
const awxRbac = require('../awxRbac');
const { authMode, ensureAccessToken } = require('../auth');

/**
 * Administration du catalogue : quel job template (ou workflow template) AWX
 * est lancé pour chaque service du portail.
 *
 * Les modèles proposés sont ceux réellement accessibles avec le jeton AWX de
 * l'utilisateur connecté (RBAC AWX). Le nom du modèle n'est jamais pris depuis
 * le navigateur : il est résolu côté serveur depuis AWX.
 */

const router = express.Router();

const SERVICE_SELECT = `
  SELECT s.id, s.name_fr, s.name_en, s.icon, s.category_id, s.approval,
         s.awx_job_template_id, s.awx_job_template_name,
         s.awx_workflow_job_template_id, s.awx_workflow_job_template_name
    FROM services s
   ORDER BY s.name_fr
`;

const toService = (row) => {
  const workflowId = Number(row.awx_workflow_job_template_id) || null;
  const jobId = Number(row.awx_job_template_id) || null;
  let kind = 'none';
  let templateId = null;
  let templateName = '';
  if (workflowId) {
    kind = 'workflow';
    templateId = workflowId;
    templateName = row.awx_workflow_job_template_name || '';
  } else if (jobId) {
    kind = 'job';
    templateId = jobId;
    templateName = row.awx_job_template_name || '';
  }
  return {
    id: row.id,
    name: { fr: row.name_fr, en: row.name_en },
    icon: row.icon,
    category: row.category_id,
    approval: row.approval,
    kind,
    templateId,
    templateName,
    jobTemplateId: jobId,
    workflowTemplateId: workflowId,
  };
};

const loadServices = async () => {
  const { rows } = await q(SERVICE_SELECT);
  return rows.map(toService);
};

/** Session AWX utilisable : renvoie { token } ou { reason }. */
const awxSession = async (req) => {
  if (authMode() !== 'awx' || !req.auth?.session) return { reason: 'auth_disabled' };
  const token = await ensureAccessToken(req.auth.session);
  if (!token) return { reason: 'no_token' };
  return { token };
};

router.get('/admin/services', async (_req, res, next) => {
  try {
    res.json({ items: await loadServices() });
  } catch (err) { next(err); }
});

/** Modèles AWX accessibles au jeton de l'utilisateur. */
router.get('/admin/awx/templates', async (req, res, next) => {
  try {
    const session = await awxSession(req);
    if (!session.token) {
      return res.json({
        templates: [], workflows: [], available: false, reason: session.reason,
      });
    }
    try {
      const data = await awx.listTemplatesDetailed(session.token);
      return res.json({ ...data, available: true });
    } catch (err) {
      console.error('[awx] modèles illisibles :', err.message);
      return res.json({
        templates: [], workflows: [], available: false, reason: 'awx_unreachable',
      });
    }
  } catch (err) { return next(err); }
});

/**
 * Affecte un modèle AWX à un service.
 * body: { kind: 'none' | 'job' | 'workflow', templateId?: number }
 */
router.patch('/admin/services/:id', async (req, res, next) => {
  try {
    const { kind, templateId } = req.body || {};
    if (!['none', 'job', 'workflow'].includes(kind)) {
      return res.status(400).json({ error: 'invalid_kind' });
    }

    const current = await q('SELECT id FROM services WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'service_not_found' });

    if (kind === 'none') {
      await q(
        `UPDATE services
            SET awx_job_template_id = NULL,
                awx_job_template_name = '',
                awx_workflow_job_template_id = NULL,
                awx_workflow_job_template_name = ''
          WHERE id = $1`,
        [req.params.id],
      );
      awxRbac.forget(req.auth?.session);
      return res.json(toService((await q(`${SERVICE_SELECT.replace('ORDER BY s.name_fr', 'WHERE s.id = $1')}`, [req.params.id])).rows[0]));
    }

    const id = Number(templateId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'template_required' });
    }

    const session = await awxSession(req);
    if (!session.token) return res.status(409).json({ error: session.reason });

    let catalog;
    try {
      catalog = await awx.listTemplatesDetailed(session.token);
    } catch (err) {
      console.error('[awx] modèles illisibles :', err.message);
      return res.status(502).json({ error: 'awx_unreachable' });
    }

    const list = kind === 'workflow' ? catalog.workflows : catalog.templates;
    const model = list.find((item) => Number(item.id) === id);
    if (!model) return res.status(403).json({ error: 'template_forbidden' });

    if (kind === 'job') {
      await q(
        `UPDATE services
            SET awx_job_template_id = $2,
                awx_job_template_name = $3,
                awx_workflow_job_template_id = NULL,
                awx_workflow_job_template_name = ''
          WHERE id = $1`,
        [req.params.id, id, String(model.name || '').slice(0, 200)],
      );
    } else {
      await q(
        `UPDATE services
            SET awx_workflow_job_template_id = $2,
                awx_workflow_job_template_name = $3,
                awx_job_template_id = NULL,
                awx_job_template_name = ''
          WHERE id = $1`,
        [req.params.id, id, String(model.name || '').slice(0, 200)],
      );
    }

    awxRbac.forget(req.auth?.session);
    const { rows } = await q(
      `${SERVICE_SELECT.replace('ORDER BY s.name_fr', 'WHERE s.id = $1')}`,
      [req.params.id],
    );
    return res.json(toService(rows[0]));
  } catch (err) { return next(err); }
});

module.exports = router;