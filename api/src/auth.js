const crypto = require('crypto');
const { q } = require('./db');
const awx = require('./awx');

/**
 * Sessions du portail.
 *
 * Le navigateur ne reçoit qu'un cookie httpOnly contenant un jeton aléatoire.
 * En base, seule son empreinte SHA-256 est stockée, avec les jetons OAuth AWX
 * de l'utilisateur (utilisés plus tard pour lancer les jobs en son nom).
 *
 * AUTH_MODE=awx active le SSO. Le mode reste « désactivé » tant que la
 * configuration AWX est incomplète, pour ne jamais verrouiller le portail.
 */

const COOKIE_NAME = 'asp_session';
const STATE_COOKIE = 'asp_oauth_state';

const authMode = () => {
  const requested = String(process.env.AUTH_MODE || 'disabled').trim().toLowerCase();
  if (requested !== 'awx') return 'disabled';
  return awx.readConfig().configured ? 'awx' : 'disabled';
};

const sessionTtlHours = () => {
  const parsed = Number(process.env.SESSION_TTL_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
};

const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

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

const setSessionCookie = (res, req, token) => {
  res.append('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieSuffix(req, sessionTtlHours() * 3600)}`);
};

const clearSessionCookie = (res, req) => {
  res.append('Set-Cookie', `${COOKIE_NAME}=; ${cookieSuffix(req, 0)}`);
};

const setStateCookie = (res, req, state) => {
  res.append('Set-Cookie', `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieSuffix(req, 600)}`);
};

const clearStateCookie = (res, req) => {
  res.append('Set-Cookie', `${STATE_COOKIE}=; ${cookieSuffix(req, 0)}`);
};

/** Origine publique du portail (retour après le callback OAuth). */
const frontendOrigin = (req) => {
  const configured = String(process.env.PORTAL_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
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
        String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim().slice(0, 64),
        String(detail || '').slice(0, 500),
      ],
    );
  } catch {
    /* le journal ne doit jamais bloquer une connexion */
  }
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
      String(tokens.access_token || ''),
      String(tokens.refresh_token || ''),
      accessExpiresAt,
      refreshExpiresAt,
      expiresAt,
      String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim().slice(0, 64),
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
         s.access_expires_at, s.refresh_expires_at, s.expires_at,
         u.id AS user_id, u.name, u.initials, u.email, u.role,
         u.role_fr, u.role_en, u.tenant_id, u.awx_username, u.awx_user_id,
         u.auth_provider, u.awx_organizations, u.awx_teams, u.last_login_at
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
   WHERE s.id = $1`;

const loadSession = async (token) => {
  if (!token) return null;
  const { rows } = await q(SESSION_SELECT, [hashToken(token)]);
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await q('DELETE FROM auth_sessions WHERE id = $1', [row.session_id]);
    return null;
  }
  return row;
};

const touchSession = (sessionId) => {
  q('UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1', [sessionId]).catch(() => {});
};

const destroySession = async (token) => {
  if (!token) return;
  await q('DELETE FROM auth_sessions WHERE id = $1', [hashToken(token)]).catch(() => {});
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
      [sessionRow.session_id, nextAccess, nextRefresh, nextExpiry],
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
  if (mode === 'disabled') return next();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return next();

  try {
    const row = await loadSession(token);
    if (!row) {
      clearSessionCookie(res, req);
      return next();
    }
    touchSession(row.session_id);
    req.auth = { mode, session: row, user: sessionUser(row), token };
  } catch {
    /* base indisponible : la route répondra 401/503 selon le cas */
  }
  return next();
};

const requireAuth = (req, res, next) => {
  if (authMode() === 'disabled') return next();
  if (!req.auth?.user) return res.status(401).json({ error: 'auth_required' });
  return next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (authMode() === 'disabled') return next();
  const role = req.auth?.user?.role;
  if (!role) return res.status(401).json({ error: 'auth_required' });
  const allowed = roles.length === 0 ? ['admin'] : roles.flat();
  if (!allowed.includes(role)) return res.status(403).json({ error: 'forbidden', role, allowed });
  return next();
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

  if (existing.rows.length) {
    const row = existing.rows[0];
    const { rows } = await q(
      `UPDATE users
          SET name = $2, initials = $3, email = COALESCE(NULLIF($4, ''), email),
              role = $5, awx_user_id = COALESCE($6, awx_user_id),
              awx_username = $7, auth_provider = 'awx', last_login_at = now(),
              awx_organizations = $8, awx_teams = $9
        WHERE id = $1
        RETURNING *`,
      [
        row.id, displayName, initialsOf(displayName), email, role,
        identity.awxUserId, identity.username, organizations, teams,
      ],
    );
    return rows[0];
  }

  const id = `u-awx-${identity.awxUserId || crypto.randomBytes(4).toString('hex')}`;
  const { rows } = await q(
    `INSERT INTO users
       (id, name, initials, email, role, awx_user_id, awx_username,
        auth_provider, last_login_at, awx_organizations, awx_teams)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'awx', now(), $8, $9)
     ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, role = EXCLUDED.role, last_login_at = now()
     RETURNING *`,
    [
      id, displayName, initialsOf(displayName),
      email || `${identity.username || id}@awx.local`,
      role, identity.awxUserId, identity.username, organizations, teams,
    ],
  );
  return rows[0];
};

module.exports = {
  COOKIE_NAME,
  STATE_COOKIE,
  authMode,
  parseCookies,
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