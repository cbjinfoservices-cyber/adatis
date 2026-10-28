const { q } = require('./db');
const { scopeOf, canSee } = require('./access');

/** Demande avec service, demandeur, tenant et connecteur (forme attendue par mappers.request). */
const REQUEST_SELECT = `
  SELECT r.*, s.name_fr, s.name_en, s.category_id, s.estimated_minutes,
         u.name AS user_name, u.initials,
         t.name AS tenant_name, cn.name AS connector_name
  FROM requests r
  JOIN services s ON s.id = r.service_id
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN tenants t ON t.id = r.tenant_id
  LEFT JOIN connectors cn ON cn.id = r.connector_id
`;

/** Service avec ses modèles Ascender (forme attendue par awxJobs.launchForRequest). */
const LAUNCH_SELECT = `
  SELECT id, name_fr, name_en, approval,
         awx_job_template_id, awx_job_template_name,
         awx_workflow_job_template_id, awx_workflow_job_template_name
  FROM services WHERE id = $1
`;

/** Ligne fraîche d'une demande (après lancement, synchronisation, annulation). */
const reload = async (id) => (await q(`${REQUEST_SELECT} WHERE r.id = $1`, [id])).rows[0];

/**
 * Demande visible par la personne connectée, sinon null : les routes
 * répondent alors 404 (sans révéler qu'elle existe).
 * @param {import('express').Request} req
 */
const findVisible = async (req) => {
  const row = await reload(req.params.id);
  return row && canSee(scopeOf(req), row) ? row : null;
};

module.exports = {
  REQUEST_SELECT, LAUNCH_SELECT, reload, findVisible,
};
