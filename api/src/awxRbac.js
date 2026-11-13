const awx = require('./awx');
const { ensureAccessToken } = require('./auth');
const { q } = require('./db');

/**
 * Droits AWX de l'utilisateur connecté (RBAC).
 *
 * On interroge AWX avec son propre jeton : la liste renvoyée est déjà filtrée
 * par les permissions AWX. Le résultat est mis en cache une minute pour éviter
 * un appel par service dans le catalogue.
 *
 * Les droits sont mis en cache une minute. Une indisponibilité AWX ne donne
 * aucun droit de lancement : les appels protégés échouent de manière fermée.
 */

const TTL_MS = 60 * 1000;
const cache = new Map();

const cacheKey = (session) => String(session?.session_id || session?.id || session?.awx_username || '');

const accessForSession = async (session) => {
  if (!session) return null;
  const key = cacheKey(session);
  const hit = key ? cache.get(key) : null;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const token = await ensureAccessToken(session);
    if (!token) return null;
    const value = await awx.listAccessibleTemplates(token);
    if (key) cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch (err) {
    console.error('[awx] droits AWX illisibles :', err.message);
    return null;
  }
};

const allowed = (access, kind, templateId) => {
  const id = Number(templateId);
  if (!access || !Number.isInteger(id) || id <= 0) return false;
  const set = kind === 'workflow' ? access.workflows : access.templates;
  if (!set) return false;
  return set.has(id);
};

/**
 * Projet Ascender d'un service : celui de son job template, tel que le voit
 * l'utilisateur. Null pour un workflow (sans projet dans AWX), un service non
 * relié ou sans droits Ascender lisibles.
 * @returns {{ id: number, name: string } | null}
 */
const projectOf = (access, template) => {
  if (!access?.projectOfTemplate || template?.kind !== 'job') return null;
  return access.projectOfTemplate.get(Number(template.id)) || null;
};

const visibilityRules = async () => {
  const { rows } = await q(
    `SELECT template_kind, template_id, project_id, allowed_roles
       FROM awx_template_visibility`,
  );
  return new Map(rows.map((row) => [
    `${row.template_kind}:${row.template_id}`,
    {
      projectId: Number(row.project_id),
      roles: row.allowed_roles || [],
    },
  ]));
};

const allowedByPortalRole = (rules, access, user, kind, templateId) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const rule = rules.get(`${kind}:${Number(templateId)}`);
  if (!rule) return true;
  const project = projectOf(access, { kind, id: templateId });
  return Boolean(project && project.id === rule.projectId && rule.roles.includes(user.role));
};

const allowedForUser = async (session, user, kind, templateId) => {
  if (!session) return true;
  const access = await accessForSession(session);
  if (!access) {
    const error = /** @type {import('./types').HttpError} */ (new Error('Droits Ascender illisibles pour la session'));
    error.status = 503;
    error.code = 'awx_access_unavailable';
    throw error;
  }
  if (!allowed(access, kind, templateId)) return false;
  const rules = await visibilityRules();
  return allowedByPortalRole(rules, access, user, kind, templateId);
};

const forget = (session) => {
  const key = cacheKey(session);
  if (key) cache.delete(key);
};

module.exports = {
  accessForSession, allowed, projectOf, visibilityRules, allowedByPortalRole, allowedForUser, forget,
};