const { authMode } = require('./auth');

/**
 * Périmètre de lecture de l'utilisateur courant.
 *
 *   admin     : tout
 *   approver  : les demandes de son tenant (tout s'il n'a pas de tenant)
 *   requester : uniquement ses propres demandes
 *
 * Sans SSO (AUTH_MODE=disabled, mode développement), aucun filtre.
 */
const scopeOf = (req) => {
  const user = req.auth?.user;
  if (authMode() === 'disabled' || !user) return { all: true, user: null };
  if (user.role === 'admin') return { all: true, user };
  if (user.role === 'approver') {
    return user.tenantId ? { all: false, user, tenantId: user.tenantId } : { all: true, user };
  }
  return { all: false, user, ownOnly: true };
};

/**
 * Condition SQL limitant `alias` (table portant user_id / tenant_id) au
 * périmètre. Ajoute ses paramètres à `params` ; chaîne vide = aucun filtre.
 */
const scopeSql = (scope, alias, params) => {
  if (scope.all) return '';
  params.push(scope.user.id);
  const userParam = `$${params.length}`;
  if (scope.ownOnly) return `${alias}.user_id = ${userParam}`;
  params.push(scope.tenantId);
  return `(${alias}.user_id = ${userParam} OR ${alias}.tenant_id = $${params.length})`;
};

/** Vrai si la ligne (user_id / tenant_id) est dans le périmètre. */
const canSee = (scope, row) => {
  if (scope.all) return true;
  if (row.user_id && row.user_id === scope.user.id) return true;
  return !scope.ownOnly && Boolean(row.tenant_id) && row.tenant_id === scope.tenantId;
};

/** Agir sur une demande (lancer un job) : son auteur ou un administrateur. */
const canActOn = (scope, row) => {
  if (!scope.user) return true;
  return scope.user.role === 'admin' || row.user_id === scope.user.id;
};

module.exports = {
  scopeOf, scopeSql, canSee, canActOn,
};
