const express = require('express');
const { q } = require('../db');
const awx = require('../awx');
const awxRbac = require('../awxRbac');
const { isWired } = require('../engines');
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
         s.awx_workflow_job_template_id, s.awx_workflow_job_template_name,
         s.connector_id, c.kind AS connector_kind, c.name AS connector_name
    FROM services s
    LEFT JOIN connectors c ON c.id = s.connector_id
   ORDER BY s.name_fr
`;

const serviceById = async (id) => {
  const { rows } = await q(SERVICE_SELECT.replace('ORDER BY s.name_fr', 'WHERE s.id = $1'), [id]);
  return rows[0] ? toService(rows[0]) : null;
};

const ascenderConnectorId = async () => {
  const { rows } = await q("SELECT id FROM connectors WHERE kind = 'ascender' ORDER BY id LIMIT 1");
  return rows[0]?.id || null;
};

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
    // Moteur qui exécute le service (connecteur).
    connector: row.connector_id
      ? { id: row.connector_id, kind: row.connector_kind, name: row.connector_name }
      : null,
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
    const connectors = await q(
      'SELECT id, name, kind, managed FROM connectors ORDER BY managed DESC, name',
    );
    res.json({
      items: await loadServices(),
      connectors: connectors.rows.map((row) => ({
        id: row.id, name: row.name, kind: row.kind, wired: isWired(row.kind),
      })),
    });
  } catch (err) { next(err); }
});

/**
 * Moteur d'un service. body: { connectorId: string | null }
 * Hors Ascender, le modèle Ascender affecté est retiré (il ne servirait plus).
 */
router.patch('/admin/services/:id/connector', async (req, res, next) => {
  try {
    const connectorId = req.body?.connectorId || null;
    const current = await q('SELECT id FROM services WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'service_not_found' });

    let kind = null;
    if (connectorId) {
      const connector = await q('SELECT kind FROM connectors WHERE id = $1', [connectorId]);
      if (!connector.rows.length) return res.status(404).json({ error: 'connector_not_found' });
      kind = connector.rows[0].kind;
    }

    await q(
      `UPDATE services
          SET connector_id = $2,
              awx_job_template_id = CASE WHEN $3 THEN awx_job_template_id ELSE NULL END,
              awx_job_template_name = CASE WHEN $3 THEN awx_job_template_name ELSE '' END,
              awx_workflow_job_template_id = CASE WHEN $3 THEN awx_workflow_job_template_id ELSE NULL END,
              awx_workflow_job_template_name = CASE WHEN $3 THEN awx_workflow_job_template_name ELSE '' END
        WHERE id = $1`,
      [req.params.id, connectorId, !connectorId || kind === 'ascender'],
    );
    awxRbac.forget(req.auth?.session);
    return res.json(await serviceById(req.params.id));
  } catch (err) { return next(err); }
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

    // Un modèle Ascender rattache le service au connecteur Ascender.
    const ascenderId = await ascenderConnectorId();
    if (kind === 'job') {
      await q(
        `UPDATE services
            SET awx_job_template_id = $2,
                awx_job_template_name = $3,
                awx_workflow_job_template_id = NULL,
                awx_workflow_job_template_name = '',
                connector_id = COALESCE($4, connector_id)
          WHERE id = $1`,
        [req.params.id, id, String(model.name || '').slice(0, 200), ascenderId],
      );
    } else {
      await q(
        `UPDATE services
            SET awx_workflow_job_template_id = $2,
                awx_workflow_job_template_name = $3,
                awx_job_template_id = NULL,
                awx_job_template_name = '',
                connector_id = COALESCE($4, connector_id)
          WHERE id = $1`,
        [req.params.id, id, String(model.name || '').slice(0, 200), ascenderId],
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