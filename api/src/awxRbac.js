const awx = require('./awx');
const { ensureAccessToken } = require('./auth');

/**
 * Droits AWX de l'utilisateur connecté (RBAC).
 *
 * On interroge AWX avec son propre jeton : la liste renvoyée est déjà filtrée
 * par les permissions AWX. Le résultat est mis en cache une minute pour éviter
 * un appel par service dans le catalogue.
 *
 * En cas d'incident AWX (timeout, 5xx), on ne filtre rien : mieux vaut afficher
 * un service de trop qu'un catalogue vide.
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
  if (!access) return true;
  if (!Number.isInteger(id) || id <= 0) return true;
  const set = kind === 'workflow' ? access.workflows : access.templates;
  if (!set) return true;
  return set.has(id);
};

const forget = (session) => {
  const key = cacheKey(session);
  if (key) cache.delete(key);
};

module.exports = { accessForSession, allowed, forget };