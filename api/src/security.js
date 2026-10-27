const { explicitKeyConfigured } = require('./secrets');

/**
 * Garde-fous de sécurité transverses.
 *
 * - configProblems() : configuration refusée en production. server.start()
 *   n'ouvre pas le port tant que la liste n'est pas vide (portail fermé
 *   plutôt qu'ouvert à moitié sécurisé).
 * - originGuard : refuse les écritures venant d'une autre origine (CSRF), en
 *   complément du cookie SameSite.
 * - noStore : aucune réponse de l'API n'est mise en cache (navigateur, proxy).
 */

const isProduction = () => process.env.NODE_ENV === 'production';

const env = (name) => String(process.env[name] || '').trim();

const httpsUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const originOf = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
};

/** Liste des problèmes bloquants (vide hors production). */
const configProblems = () => {
  if (!isProduction()) return [];
  const problems = [];

  if (env('AUTH_MODE').toLowerCase() !== 'awx') {
    problems.push('AUTH_MODE doit valoir « awx » : le SSO Ascender est obligatoire en production.');
  }
  if (!env('AWX_BASE_URL') || !env('AWX_CLIENT_ID') || !env('AWX_CLIENT_SECRET')) {
    problems.push('AWX_BASE_URL, AWX_CLIENT_ID et AWX_CLIENT_SECRET sont obligatoires.');
  } else if (!httpsUrl(env('AWX_BASE_URL'))) {
    problems.push('AWX_BASE_URL doit être en https://.');
  }
  if (!httpsUrl(env('PORTAL_URL'))) {
    problems.push('PORTAL_URL doit être renseignée en https:// (origine de confiance du portail).');
  }
  if (env('AWX_REDIRECT_URI') && originOf(env('AWX_REDIRECT_URI')) !== originOf(env('PORTAL_URL'))) {
    problems.push('AWX_REDIRECT_URI doit être sur la même origine que PORTAL_URL.');
  }
  if (!explicitKeyConfigured()) {
    problems.push('TOKEN_ENCRYPTION_KEY doit être fournie (32 octets en base64 ou hexadécimal).');
  }
  if (env('COOKIE_SECURE').toLowerCase() === 'false') {
    problems.push('COOKIE_SECURE=false est interdit : le cookie de session doit être Secure.');
  }
  const origins = env('ALLOWED_ORIGINS').split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.includes('*')) {
    problems.push('ALLOWED_ORIGINS=* est interdit.');
  } else if (origins.some((o) => !httpsUrl(o))) {
    problems.push('Chaque origine de ALLOWED_ORIGINS doit être en https://.');
  }
  if (env('PG_SSL') !== 'true') {
    problems.push('PG_SSL=true est obligatoire : la connexion à PostgreSQL doit être chiffrée.');
  } else if (env('PG_SSL_REJECT_UNAUTHORIZED') === 'false') {
    problems.push('PG_SSL_REJECT_UNAUTHORIZED=false est interdit : le certificat PostgreSQL doit être vérifié.');
  }
  if (env('NODE_TLS_REJECT_UNAUTHORIZED') === '0') {
    problems.push('NODE_TLS_REJECT_UNAUTHORIZED=0 est interdit : utiliser NODE_EXTRA_CA_CERTS pour une autorité interne.');
  }
  if (env('RESEND_API_KEY') && env('ALLOW_EXTERNAL_MAIL').toLowerCase() !== 'true') {
    problems.push('RESEND_API_KEY envoie des emails par un service externe : utiliser SMTP_HOST, ou ALLOW_EXTERNAL_MAIL=true pour l\'accepter explicitement.');
  }
  return problems;
};

/** Origines autorisées à écrire : le portail et les origines tierces déclarées. */
const trustedOrigins = (req) => {
  const list = env('ALLOWED_ORIGINS').split(',').map((o) => o.trim()).filter((o) => o && o !== '*');
  const portal = originOf(env('PORTAL_URL'));
  if (portal) list.push(portal);
  else if (!isProduction()) {
    // Développement sans PORTAL_URL : l'origine de la requête elle-même.
    const host = String(req.headers.host || '');
    if (host) list.push(`${req.protocol}://${host}`);
  }
  return list;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF : une écriture doit venir du portail lui-même. Sec-Fetch-Site
 * (navigateurs récents) puis Origin font foi ; une requête sans aucun des deux
 * ne vient pas d'un navigateur (script, supervision) et n'emporte pas de cookie
 * à l'insu de l'utilisateur.
 */
const originGuard = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const origin = String(req.headers.origin || '');
  if (site === 'same-origin' || site === 'none') return next();
  if (!site && !origin) return next();
  if (origin && trustedOrigins(req).includes(origin)) return next();
  return res.status(403).json({ error: 'cross_origin_forbidden' });
};

const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
};

module.exports = {
  configProblems, originGuard, noStore, trustedOrigins,
};
