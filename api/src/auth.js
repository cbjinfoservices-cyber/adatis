const crypto = require('crypto');
const { q } = require('./db');
const awx = require('./awx');
const { encrypt, decrypt } = require('./secrets');
const audit = require('./audit');

/**
 * Sessions du portail.
 *
 * Le navigateur ne reçoit qu'un cookie httpOnly contenant un jeton aléatoire.
 * En base, seule son empreinte SHA-256 est stockée, avec les jetons OAuth AWX
 * de l'utilisateur (utilisés plus tard pour lancer les jobs en son nom).
 *
 * AUTH_MODE=awx active le SSO. Si la configuration Ascender est incomplète,
 * le mode passe à « misconfigured » : le portail reste fermé (503) plutôt que
 * de s'ouvrir sans authentification.
 */

/**
 * Noms des cookies. En HTTPS, préfixe « __Host- » : le navigateur exige alors
 * Secure, Path=/ et aucun Domain, si bien qu'un sous-domaine ne peut ni lire
 * ni imposer le cookie de session. En HTTP (développement local), noms simples.
 */
const COOKIE_NAME = 'asp_session';
const STATE_COOKIE = 'asp_oauth_state';
const HOST_PREFIX = '__Host-';

/** 'awx' (SSO actif), 'disabled' (portail ouvert, dev) ou 'misconfigured' (fermé). */
const authMode = () => {
  const requested = String(process.env.AUTH_MODE || 'disabled').trim().toLowerCase();
  if (requested !== 'awx') return 'disabled';
  return awx.readConfig().configured ? 'awx' : 'misconfigured';
};

const misconfigured = (res) => res.status(503).json({
  error: 'auth_misconfigured',
  message: 'AUTH_MODE=awx mais AWX_BASE_URL, AWX_CLIENT_ID ou AWX_CLIENT_SECRET manque.',
});

const sessionTtlHours = () => {
  const parsed = Number(process.env.SESSION_TTL_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
};

/** Minutes d'inactivité avant expiration de la session (0 = pas d'expiration d'inactivité). */
const sessionIdleMinutes = () => {
  const parsed = Number(process.env.SESSION_IDLE_MINUTES);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
};

const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** Adresse du client vue par le proxy de confiance (trust proxy), jamais l'en-tête brut. */
const clientIp = (req) => String(req?.ip || req?.socket?.remoteAddress || '').slice(0, 64);

const parseCookies = (header) => {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index < 0) return;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (key) out[key] = decodeURIComponent(value);
    });
  return out;
};

const isSecureRequest = (req) => {
  const forced = String(process.env.COOKIE_SECURE || '').toLowerCase();
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || '').split(',')[0].trim();
  return proto === 'https';
};

const cookieSuffix = (req, maxAgeSeconds) => {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
};

const cookieName = (req, base) => (isSecureRequest(req) ? `${HOST_PREFIX}${base}` : base);

/** Jeton de session du cookie. En HTTPS, seul le cookie « __Host- » est accepté. */
const readSessionToken = (req) => parseCookies(req.headers.cookie)[cookieName(req, COOKIE_NAME)] || '';

const readStateCookie = (req) => parseCookies(req.headers.cookie)[cookieName(req, STATE_COOKIE)] || '';

const setSessionCookie = (res, req, token) => {
  res.append('Set-Cookie', `${cookieName(req, COOKIE_NAME)}=${encodeURIComponent(token)}; ${cookieSuffix(req, sessionTtlHours() * 3600)}`);
};

const clearSessionCookie = (res, req) => {
  res.append('Set-Cookie', `${cookieName(req, COOKIE_NAME)}=; ${cookieSuffix(req, 0)}`);
};

const setStateCookie = (res, req, state) => {
  res.append('Set-Cookie', `${cookieName(req, STATE_COOKIE)}=${encodeURIComponent(state)}; ${cookieSuffix(req, 600)}`);
};

const clearStateCookie = (res, req) => {
  res.append('Set-Cookie', `${cookieName(req, STATE_COOKIE)}=; ${cookieSuffix(req, 0)}`);
};

/**
 * Origine publique du portail (retour après le callback OAuth). En production,
 * PORTAL_URL est obligatoire (contrôle au démarrage) : les en-têtes Host et
 * X-Forwarded-Host, falsifiables, ne servent qu'en développement.
 */
const frontendOrigin = (req) => {
  const configured = String(process.env.PORTAL_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return '';
  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http').split(',')[0].trim();
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
  return host ? `${proto}://${host}` : '';
};

/** URL de retour OAuth : priorité à AWX_REDIRECT_URI, sinon <portail>/api/auth/callback */
const callbackUrl = (req) => {
  const configured = String(process.env.AWX_REDIRECT_URI || '').trim();
  if (configured) return configured;
  return `${frontendOrigin(req)}/api/auth/callback`;
};

const initialsOf = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('') || 'AW';

const roleRank = { requester: 0, approver: 1, admin: 2 };

const normalize = (value) => String(value || '').trim().toLowerCase();

/**
 * Rôle portail déduit de l'identité AWX et des mappings org/équipe.
 * Priorité : superuser AWX ou AWX_ADMIN_USERS > mapping le plus élevé.
 */
const resolveRole = ({ isSuperuser, username, organizations, teams }, mappings) => {
  if (isSuperuser) return { role: 'admin', reason: 'awx_superuser' };
  if (awx.adminUsernames().includes(normalize(username))) {
    return { role: 'admin', reason: 'awx_admin_list' };
  }

  const orgNames = (organizations || []).map((org) => normalize(org.name));
  const teamPairs = (teams || []).map((team) => ({
    name: normalize(team.name),
    organization: normalize(team.organization),
  }));

  let best = { role: 'requester', reason: 'default' };
  (mappings || []).forEach((mapping) => {
    const wantOrg = normalize(mapping.awx_org);
    const wantTeam = normalize(mapping.awx_team);

    const orgOk = !wantOrg || orgNames.includes(wantOrg);
    const teamOk = !wantTeam || teamPairs.some((team) => team.name === wantTeam
      && (!wantOrg || !team.organization || team.organization === wantOrg));

    if (orgOk && teamOk && roleRank[mapping.role] > roleRank[best.role]) {
      best = { role: mapping.role, reason: `${mapping.awx_org || '*'}/${mapping.awx_team || '*'}` };
    }
  });
  return best;
};

const listMappings = async () => {
  try {
    const { rows } = await q('SELECT * FROM awx_role_mappings ORDER BY role DESC, awx_org, awx_team');
    return rows;
  } catch {
    return [];
  }
};

const logEvent = async ({ kind, username, role, email, req, detail }) => {
  try {
    await q(
      `INSERT INTO auth_events (kind, username, role, email, ip, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        kind,
        String(username || '').slice(0, 120),
        String(role || '').slice(0, 20),
        String(email || '').slice(0, 200),
        clientIp(req),
        String(detail || '').slice(0, 500),
      ],
    );
  } catch {
    /* le journal ne doit jamais bloquer une connexion */
  }
  audit.record({
    req,
    action: `auth.${kind}`,
    actor: { name: String(username || ''), role: String(role || '') },
    status: kind === 'login_failed' ? 401 : 200,
    detail: { email: String(email || '').slice(0, 200), detail: String(detail || '').slice(0, 500) },
  });
};

/** Crée une session et retourne le jeton à placer dans le cookie. */
const createSession = async ({ userId, username, tokens, req }) => {
  const token = crypto.randomBytes(32).toString('hex');
  const accessExpiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
    : null;
  const refreshExpiresAt = tokens.refresh_token && tokens.scope === undefined && tokens.refresh_expires_in
    ? new Date(Date.now() + Number(tokens.refresh_expires_in) * 1000)
    : null;
  const expiresAt = new Date(Date.now() + sessionTtlHours() * 3600 * 1000);

  await q(
    `INSERT INTO auth_sessions
       (id, user_id, awx_username, access_token, refresh_token,
        access_expires_at, refresh_expires_at, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      hashToken(token),
      userId,
      String(username || '').slice(0, 120),
      encrypt(tokens.access_token),
      encrypt(tokens.refresh_token),
      accessExpiresAt,
      refreshExpiresAt,
      expiresAt,
      clientIp(req),
      String(req?.headers?.['user-agent'] || '').slice(0, 300),
    ],
  );

  return token;
};

const sessionUser = (row) => ({
  id: row.user_id,
  name: row.name,
  initials: row.initials || initialsOf(row.name),
  email: row.email,
  role: row.role,
  roleFr: row.role_fr || '',
  roleEn: row.role_en || '',
  tenantId: row.tenant_id,
  awxUsername: row.awx_username || '',
  awxUserId: row.awx_user_id,
  authProvider: row.auth_provider || 'local',
  organizations: row.awx_organizations || [],
  teams: row.awx_teams || [],
  lastLoginAt: row.last_login_at,
});

const SESSION_SELECT = `
  SELECT s.id AS session_id, s.access_token, s.refresh_token,
         s.access_expires_at, s.refresh_expires_at, s.expires_at, s.last_seen_at,
         u.id AS user_id, u.name, u.initials, u.email, u.role,
         u.role_fr, u.role_en, u.tenant_id, u.awx_username, u.awx_user_id,
         u.auth_provider, u.awx_organizations, u.awx_teams, u.last_login_at
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
   WHERE s.id = $1`;

/** Jetons Ascender chiffrés en base, en clair uniquement en mémoire. */
const withPlainTokens = (row) => (row
  ? { ...row, access_token: decrypt(row.access_token), refresh_token: decrypt(row.refresh_token) }
  : null);

const loadSession = async (token) => {
  if (!token) return null;
  const { rows } = await q(SESSION_SELECT, [hashToken(token)]);
  const row = rows[0];
  if (!row) return null;
  // Session expirée ou inactive : refusée pour l'authentification. La ligne est
  // conservée pendant le délai de grâce (lancement après approbation), puis purgée.
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const idleMs = sessionIdleMinutes() * 60 * 1000;
  if (idleMs > 0 && new Date(row.last_seen_at).getTime() + idleMs < Date.now()) {
    await q('UPDATE auth_sessions SET expires_at = least(expires_at, now()) WHERE id = $1', [row.session_id]);
    return null;
  }
  return withPlainTokens(row);
};

/** Jours pendant lesquels une session expirée peut encore servir à lancer un job approuvé. */
const launchGraceDays = () => {
  const parsed = Number(process.env.SESSION_LAUNCH_GRACE_DAYS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 7;
};

/**
 * Session du demandeur pour lancer un job après approbation, avec SES droits
 * Ascender même s'il n'est plus connecté : une session valide de préférence,
 * sinon une session expirée depuis moins du délai de grâce dont le jeton de
 * renouvellement est encore utilisable.
 */
const latestSessionForUser = async (userId) => {
  if (!userId) return null;
  const { rows } = await q(
    `${SESSION_SELECT.replace(
      'WHERE s.id = $1',
      `WHERE s.user_id = $1
         AND (s.expires_at > now()
              OR (s.refresh_token <> '' AND s.expires_at > now() - make_interval(days => $2)))`,
    )}
     ORDER BY (s.expires_at > now()) DESC, s.last_seen_at DESC LIMIT 1`,
    [userId, launchGraceDays()],
  );
  return withPlainTokens(rows[0]);
};

/** Purge des sessions expirées depuis plus que le délai de grâce. */
const purgeSessions = () => q(
  'DELETE FROM auth_sessions WHERE expires_at < now() - make_interval(days => $1)',
  [launchGraceDays()],
);

const touchSession = (sessionId) => {
  q('UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1', [sessionId]).catch(() => {});
};

const destroySession = async (token) => {
  if (!token) return;
  await q('DELETE FROM auth_sessions WHERE id = $1', [hashToken(token)]).catch(() => {});
};

/**
 * Révoque toutes les sessions d'un utilisateur (déconnexion forcée). Les
 * jetons Ascender stockés sont supprimés : aucun job approuvé ne pourra plus
 * partir en son nom avant sa prochaine connexion.
 */
const revokeUserSessions = async (userId) => {
  const { rowCount } = await q('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
  return rowCount;
};

/**
 * Jeton AWX valide pour la session, rafraîchi si nécessaire.
 * Sera utilisé pour lancer les jobs AWX au nom de l'utilisateur.
 */
const ensureAccessToken = async (sessionRow) => {
  if (!sessionRow) return '';
  const expiresAt = sessionRow.access_expires_at ? new Date(sessionRow.access_expires_at).getTime() : 0;
  if (sessionRow.access_token && expiresAt - 30000 > Date.now()) return sessionRow.access_token;
  if (!sessionRow.refresh_token) return sessionRow.access_token || '';

  try {
    const tokens = await awx.refreshAccessToken(sessionRow.refresh_token);
    const nextAccess = String(tokens.access_token || '');
    const nextRefresh = String(tokens.refresh_token || sessionRow.refresh_token);
    const nextExpiry = tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
      : null;
    await q(
      `UPDATE auth_sessions
          SET access_token = $2, refresh_token = $3, access_expires_at = $4
        WHERE id = $1`,
      [sessionRow.session_id, encrypt(nextAccess), encrypt(nextRefresh), nextExpiry],
    );
    return nextAccess;
  } catch {
    return sessionRow.access_token || '';
  }
};

/** Attache req.auth (session + utilisateur) à chaque requête /api. */
const attachSession = async (req, res, next) => {
  const mode = authMode();
  req.auth = { mode, session: null, user: null, token: '' };
  if (mode !== 'awx') return next();

  const token = readSessionToken(req);
  if (!token) return next();

  try {
    const row = await loadSession(token);
    if (!row) {
      clearSessionCookie(res, req);
      req.auth.expired = true;
      return next();
    }
    // Seule une activité réelle prolonge la session : le client marque
    // « X-Activity: background » les rafraîchissements automatiques.
    if (String(req.headers['x-activity'] || '') !== 'background') touchSession(row.session_id);
    req.auth = { mode, session: row, user: sessionUser(row), token };
  } catch {
    /* base indisponible : la route répondra 401/503 selon le cas */
  }
  return next();
};

const requireAuth = (req, res, next) => {
  const mode = authMode();
  if (mode === 'disabled') return next();
  if (mode === 'misconfigured') return misconfigured(res);
  if (!req.auth?.user) return res.status(401).json({ error: req.auth?.expired ? 'session_expired' : 'auth_required' });
  return next();
};

const requireRole = (...roles) => (req, res, next) => {
  const mode = authMode();
  if (mode === 'disabled') return next();
  if (mode === 'misconfigured') return misconfigured(res);
  const role = req.auth?.user?.role;
  if (!role) return res.status(401).json({ error: 'auth_required' });
  const allowed = roles.length === 0 ? ['admin'] : roles.flat();
  if (!allowed.includes(role)) return res.status(403).json({ error: 'forbidden', role, allowed });
  return next();
};

/**
 * Tenant de l'utilisateur : celui relié (tenants.awx_organization) à l'une de
 * ses organisations Ascender. Aucun tenant relié : null.
 */
const tenantForOrganizations = async (organizations) => {
  const names = (organizations || []).map((org) => String(org.name || '').trim().toLowerCase()).filter(Boolean);
  if (!names.length) return null;
  try {
    const { rows } = await q(
      `SELECT id FROM tenants WHERE awx_organization <> '' AND lower(awx_organization) = ANY($1)
        ORDER BY name LIMIT 1`,
      [names],
    );
    return rows[0]?.id || null;
  } catch {
    return null;
  }
};

/** Utilisateur portail aligné sur l'identité AWX (créé au premier login). */
const upsertUser = async ({ identity, role }) => {
  const email = String(identity.email || '').trim().toLowerCase();
  const displayName = [identity.firstName, identity.lastName].filter(Boolean).join(' ').trim()
    || identity.username
    || email
    || 'Utilisateur AWX';

  const existing = await q(
    `SELECT * FROM users
      WHERE ($1::int IS NOT NULL AND awx_user_id = $1)
         OR ($2 <> '' AND lower(email) = $2)
      LIMIT 1`,
    [identity.awxUserId, email],
  );

  const organizations = (identity.organizations || []).map((org) => org.name);
  const teams = (identity.teams || []).map((team) => team.name);
  const tenantId = await tenantForOrganizations(identity.organizations);

  if (existing.rows.length) {
    const row = existing.rows[0];
    const { rows } = await q(
      `UPDATE users
          SET name = $2, initials = $3, email = COALESCE(NULLIF($4, ''), email),
              role = $5, awx_user_id = COALESCE($6, awx_user_id),
              awx_username = $7, auth_provider = 'awx', last_login_at = now(),
              awx_organizations = $8, awx_teams = $9, tenant_id = $10
        WHERE id = $1
        RETURNING *`,
      [
        row.id, displayName, initialsOf(displayName), email, role,
        identity.awxUserId, identity.username, organizations, teams, tenantId,
      ],
    );
    return rows[0];
  }

  const id = `u-awx-${identity.awxUserId || crypto.randomBytes(4).toString('hex')}`;
  const { rows } = await q(
    `INSERT INTO users
       (id, name, initials, email, role, awx_user_id, awx_username,
        auth_provider, last_login_at, awx_organizations, awx_teams, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'awx', now(), $8, $9, $10)
     ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, role = EXCLUDED.role, last_login_at = now(),
            tenant_id = EXCLUDED.tenant_id
     RETURNING *`,
    [
      id, displayName, initialsOf(displayName),
      email || `${identity.username || id}@awx.local`,
      role, identity.awxUserId, identity.username, organizations, teams, tenantId,
    ],
  );
  return rows[0];
};

module.exports = {
  COOKIE_NAME,
  STATE_COOKIE,
  authMode,
  parseCookies,
  readSessionToken,
  readStateCookie,
  clientIp,
  sessionIdleMinutes,
  revokeUserSessions,
  setSessionCookie,
  clearSessionCookie,
  setStateCookie,
  clearStateCookie,
  frontendOrigin,
  callbackUrl,
  resolveRole,
  listMappings,
  logEvent,
  createSession,
  loadSession,
  latestSessionForUser,
  purgeSessions,
  destroySession,
  ensureAccessToken,
  attachSession,
  requireAuth,
  requireRole,
  upsertUser,
  sessionUser,
  initialsOf,
  hashToken,
};