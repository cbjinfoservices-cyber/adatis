const express = require('express');
const crypto = require('crypto');
const { q } = require('../db');
const awx = require('../awx');
const {
  authMode,
  parseCookies,
  STATE_COOKIE,
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
  destroySession,
  ensureAccessToken,
  upsertUser,
  sessionUser,
  requireRole,
} = require('../auth');

const router = express.Router();

const ROLE_VALUES = ['admin', 'approver', 'requester'];

const safeNext = (value) => {
  const raw = String(value || '');
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw.slice(0, 400);
};

const redirectToLogin = (req, res, code) => {
  const origin = frontendOrigin(req);
  const target = `${origin}/login?auth_error=${encodeURIComponent(code)}`;
  return res.redirect(302, target || '/login');
};

/** Configuration publique : rien de sensible, juste de quoi afficher l'écran de connexion. */
router.get('/config', (req, res) => {
  const config = awx.readConfig();
  res.json({
    mode: authMode(),
    provider: 'awx',
    configured: config.configured,
    loginUrl: '/api/auth/login',
    redirectUri: callbackUrl(req),
    scopes: config.scopes,
    checks: {
      baseUrl: Boolean(config.baseUrl),
      clientId: Boolean(config.clientId),
      clientSecret: Boolean(config.clientSecret),
      redirectUri: Boolean(callbackUrl(req)),
    },
    adminUsernames: awx.adminUsernames().length,
    sessionHours: (() => {
      const parsed = Number(process.env.SESSION_TTL_HOURS);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
    })(),
  });
});

/** Étape 1 : redirection vers l'écran de connexion AWX. */
router.get('/login', (req, res) => {
  if (authMode() === 'disabled') return res.redirect(302, `${frontendOrigin(req)}/login?auth_error=disabled`);
  const next = safeNext(req.query.next);
  const state = `${crypto.randomBytes(16).toString('hex')}|${next}`;
  setStateCookie(res, req, state);
  try {
    return res.redirect(302, awx.authorizeUrl({ state, redirectUri: callbackUrl(req) }));
  } catch (err) {
    console.error('[auth] authorize', err.message);
    return redirectToLogin(req, res, 'awx_unreachable');
  }
});

/** Étape 2 : AWX renvoie le code, on échange contre des jetons et on ouvre la session. */
router.get('/callback', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const expectedState = cookies[STATE_COOKIE];
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    clearStateCookie(res, req);
    console.warn('[auth] AWX a refusé la connexion :', error, errorDescription || '');
    return redirectToLogin(req, res, String(error).slice(0, 60));
  }
  if (!code || !state || !expectedState || String(state) !== expectedState) {
    clearStateCookie(res, req);
    return redirectToLogin(req, res, 'invalid_state');
  }

  clearStateCookie(res, req);
  const next = safeNext(String(state).split('|')[1] || '/');

  try {
    const tokens = await awx.exchangeCode({ code: String(code), redirectUri: callbackUrl(req) });
    const identity = await awx.fetchIdentity(tokens.access_token);
    if (!identity.username) throw new Error('AWX n’a pas renvoyé d’identifiant utilisateur');

    const mappings = await listMappings();
    const { role, reason } = resolveRole(identity, mappings);
    const user = await upsertUser({ identity, role });
    const sessionToken = await createSession({
      userId: user.id,
      username: identity.username,
      tokens,
      req,
    });

    setSessionCookie(res, req, sessionToken);
    await logEvent({
      kind: 'login_ok',
      username: identity.username,
      role,
      email: identity.email,
      req,
      detail: `role=${role} (${reason})`,
    });

    const origin = frontendOrigin(req);
    return res.redirect(302, `${origin}${next}` || '/');
  } catch (err) {
    console.error('[auth] callback', err.message);
    await logEvent({
      kind: 'login_failed',
      username: '',
      role: '',
      email: '',
      req,
      detail: err.message,
    });
    return redirectToLogin(req, res, 'exchange_failed');
  }
});

/** Session courante (appelé au chargement de chaque page). */
router.get('/me', async (req, res) => {
  const mode = authMode();
  const session = req.auth?.session || null;
  const user = req.auth?.user || null;

  if (mode === 'disabled' || !session || !user) {
    return res.json({
      mode,
      authenticated: false,
      user: null,
      permissions: {
        canAdmin: false, canApprove: false, canViewAdmin: false, canRequest: true,
      },
      awx: { connected: false },
    });
  }

  const accessExpiresAt = session.access_expires_at || null;
  const needsRefresh = Boolean(accessExpiresAt && new Date(accessExpiresAt).getTime() <= Date.now());

  return res.json({
    mode,
    authenticated: true,
    user,
    permissions: {
      canAdmin: user.role === 'admin',
      canApprove: user.role === 'admin' || user.role === 'approver',
      // Les approbateurs ouvrent l'administration en lecture seule.
      canViewAdmin: ['admin', 'approver'].includes(user.role),
      canRequest: true,
    },
    awx: {
      connected: Boolean(session.access_token),
      username: session.awx_username,
      accessExpiresAt,
      refreshExpiresAt: session.refresh_expires_at,
      needsRefresh,
      hasRefreshToken: Boolean(session.refresh_token),
    },
    session: {
      expiresAt: session.expires_at,
      lastSeenAt: new Date().toISOString(),
    },
  });
});

/** Renouvelle le jeton AWX à la demande (bouton « reconnecter le jeton »). */
router.post('/refresh', async (req, res) => {
  const session = req.auth?.session;
  if (!session) return res.status(401).json({ error: 'auth_required' });
  const token = await ensureAccessToken(session);
  if (!token) return res.status(502).json({ error: 'awx_refresh_failed' });
  return res.json({ ok: true, accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
});

router.post('/logout', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  await destroySession(cookies.asp_session);
  clearSessionCookie(res, req);
  if (req.auth?.user) {
    await logEvent({
      kind: 'logout',
      username: req.auth.user.awxUsername,
      role: req.auth.user.role,
      email: req.auth.user.email,
      req,
      detail: '',
    });
  }
  return res.json({ ok: true });
});

/** Mappings organisation/équipe AWX -> rôle portail (administration). */
router.get('/mappings', requireRole('admin', 'approver'), async (_req, res, next) => {
  try {
    const mappings = await listMappings();
    const session = _req.auth?.session;
    let suggestions = { organizations: [], teams: [] };
    if (session?.access_token) {
      try {
        const identity = await awx.fetchIdentity(await ensureAccessToken(session));
        suggestions = {
          organizations: (identity.organizations || []).map((org) => org.name),
          teams: (identity.teams || []).map((team) => team.name),
        };
      } catch {
        /* suggestions facultatives : AWX peut être momentanément injoignable */
      }
    }
    const users = await q(
      `SELECT role, count(*)::int AS count FROM users GROUP BY role`,
    );
    res.json({
      mappings: mappings.map((row) => ({
        id: Number(row.id),
        awxOrg: row.awx_org,
        awxTeam: row.awx_team,
        role: row.role,
        note: row.note,
        createdAt: row.created_at,
      })),
      suggestions,
      roleCounts: Object.fromEntries(users.rows.map((row) => [row.role, row.count])),
    });
  } catch (err) { next(err); }
});

router.post('/mappings', requireRole('admin'), async (req, res, next) => {
  try {
    const { awxOrg = '', awxTeam = '', role = 'requester', note = '' } = req.body || {};
    if (!ROLE_VALUES.includes(role)) return res.status(400).json({ error: 'invalid_role' });

    const cleanOrg = String(awxOrg).trim().slice(0, 120);
    const cleanTeam = String(awxTeam).trim().slice(0, 120);
    if (!cleanOrg && !cleanTeam) return res.status(400).json({ error: 'mapping_scope_required' });

    const { rows } = await q(
      `INSERT INTO awx_role_mappings (awx_org, awx_team, role, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lower(awx_org), lower(awx_team))
       DO UPDATE SET role = EXCLUDED.role, note = EXCLUDED.note
       RETURNING *`,
      [cleanOrg, cleanTeam, role, String(note).slice(0, 300)],
    );
    await logEvent({
      kind: 'mapping_saved',
      username: req.auth?.user?.awxUsername || '',
      role: req.auth?.user?.role || '',
      email: req.auth?.user?.email || '',
      req,
      detail: `${cleanOrg || '*'}/${cleanTeam || '*'} -> ${role}`,
    });
    const row = rows[0];
    return res.status(201).json({
      id: Number(row.id),
      awxOrg: row.awx_org,
      awxTeam: row.awx_team,
      role: row.role,
      note: row.note,
      createdAt: row.created_at,
    });
  } catch (err) { return next(err); }
});

router.delete('/mappings/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rowCount } = await q('DELETE FROM awx_role_mappings WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'mapping_not_found' });
    return res.status(204).end();
  } catch (err) { return next(err); }
});

/** Dernières tentatives de connexion (transparence / support). */
router.get('/events', requireRole('admin', 'approver'), async (_req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT id, at, kind, username, role, email, ip, detail
         FROM auth_events ORDER BY at DESC LIMIT 25`,
    );
    res.json(rows.map((row) => ({
      id: Number(row.id),
      at: row.at,
      kind: row.kind,
      username: row.username,
      role: row.role,
      email: row.email,
      ip: row.ip,
      detail: row.detail,
    })));
  } catch (err) { next(err); }
});

/** Identité AWX du porteur de la session (organisations / équipes en direct). */
router.get('/identity', async (req, res, next) => {
  try {
    const session = req.auth?.session;
    if (!session) return res.status(401).json({ error: 'auth_required' });
    const token = await ensureAccessToken(session);
    if (!token) return res.status(502).json({ error: 'awx_unavailable' });
    const identity = await awx.fetchIdentity(token);
    const user = sessionUser(session);
    return res.json({
      username: identity.username,
      email: identity.email,
      isSuperuser: identity.isSuperuser,
      organizations: identity.organizations,
      teams: identity.teams,
      role: user.role,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;