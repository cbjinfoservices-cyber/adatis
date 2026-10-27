const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');

let stack;
let admin;

test.before(async () => {
  stack = await startStack();
  admin = await stack.login('admin');
});

test.after(async () => {
  await stack.stop();
});

const post = (url, headers, body = {}) => fetch(`${stack.base}${url}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

/* --- CSRF et cache --------------------------------------------------------- */

test('CSRF : écriture refusée depuis une origine tierce', async () => {
  const alice = await stack.login('alice');
  const body = { serviceId: 'create-dns-record', payload: PAYLOADS['create-dns-record'] };
  const evil = await post('/api/requests', { Cookie: alice, Origin: 'https://evil.example' }, body);
  assert.equal(evil.status, 403);
  assert.equal((await evil.json()).error, 'cross_origin_forbidden');

  const crossSite = await post('/api/requests', { Cookie: alice, 'Sec-Fetch-Site': 'cross-site' }, body);
  assert.equal(crossSite.status, 403);

  const portal = await post('/api/requests', { Cookie: alice, Origin: 'http://portal.test' }, body);
  assert.equal(portal.status, 201);
  const sameOrigin = await post('/api/requests', { Cookie: alice, 'Sec-Fetch-Site': 'same-origin' }, body);
  assert.equal(sameOrigin.status, 201);
});

test('réponses de l’API jamais mises en cache', async () => {
  const res = await stack.call('GET', '/api/auth/me', { cookie: admin });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

/* --- Sessions -------------------------------------------------------------- */

test('session inactive au-delà de SESSION_IDLE_MINUTES : refusée', async () => {
  const carol = await stack.login('carol');
  await stack.db.query("UPDATE auth_sessions SET last_seen_at = now() - interval '31 minutes' WHERE awx_username = 'carol'");
  const res = await stack.call('GET', '/api/requests', { cookie: carol });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'session_expired');
});

test('rafraîchissement automatique (X-Activity: background) : ne prolonge pas la session', async () => {
  const bob = await stack.login('bob');
  await stack.db.query("UPDATE auth_sessions SET last_seen_at = now() - interval '10 minutes' WHERE awx_username = 'bob'");
  const before = (await stack.db.query("SELECT last_seen_at FROM auth_sessions WHERE awx_username = 'bob'")).rows[0].last_seen_at;
  const res = await fetch(`${stack.base}/api/requests`, { headers: { Cookie: bob, 'X-Activity': 'background' } });
  assert.equal(res.status, 200);
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  const after = (await stack.db.query("SELECT last_seen_at FROM auth_sessions WHERE awx_username = 'bob'")).rows[0].last_seen_at;
  assert.equal(new Date(after).getTime(), new Date(before).getTime());
});

test('révocation : un administrateur déconnecte un utilisateur partout', async () => {
  const alice1 = await stack.login('alice');
  const alice2 = await stack.login('alice');
  const { rows } = await stack.db.query("SELECT id FROM users WHERE awx_username = 'alice'");

  const denied = await stack.call('POST', `/api/auth/users/${rows[0].id}/revoke`, { cookie: alice1, body: {} });
  assert.equal(denied.status, 403);

  const done = await stack.call('POST', `/api/auth/users/${rows[0].id}/revoke`, { cookie: admin, body: {} });
  assert.equal(done.status, 200);
  assert.ok(done.body.revoked >= 2);
  for (const cookie of [alice1, alice2]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await stack.call('GET', '/api/requests', { cookie })).status, 401);
  }
});

test('déconnexion de toutes ses sessions', async () => {
  const a = await stack.login('carol');
  const b = await stack.login('carol');
  const res = await stack.call('POST', '/api/auth/logout-all', { cookie: a, body: {} });
  assert.equal(res.status, 200);
  assert.equal((await stack.call('GET', '/api/requests', { cookie: b })).status, 401);
});

test('HTTPS : cookies préfixés __Host-', async () => {
  process.env.COOKIE_SECURE = 'true';
  try {
    const res = await fetch(`${stack.base}/api/auth/login`, { redirect: 'manual' });
    const cookie = res.headers.getSetCookie()[0];
    assert.match(cookie, /^__Host-asp_oauth_state=/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /Domain=/i);
  } finally {
    delete process.env.COOKIE_SECURE;
  }
});

/* --- Journal d'audit -------------------------------------------------------- */

const waitForAudit = async (predicate) => {
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await stack.db.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50');
    const found = rows.find(predicate);
    if (found) return found;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 50); });
  }
  return null;
};

test('audit : écriture tracée avec auteur, issue et noms de champs, sans valeurs', async () => {
  const res = await stack.call('POST', '/api/auth/mappings', {
    cookie: admin, body: { awxOrg: 'Audit', awxTeam: '', role: 'requester', note: 'valeur-sensible' },
  });
  assert.equal(res.status, 201);
  const entry = await waitForAudit((r) => r.action === 'POST /api/auth/mappings');
  assert.ok(entry, 'entrée d’audit attendue');
  assert.equal(entry.actor_role, 'admin');
  assert.equal(entry.status, 201);
  assert.ok(entry.detail.fields.includes('note'));
  assert.ok(!JSON.stringify(entry).includes('valeur-sensible'));
});

test('audit : connexions et refus tracés', async () => {
  const alice = await stack.login('alice');
  assert.ok(await waitForAudit((r) => r.action === 'auth.login_ok' && r.actor_name === 'alice'));
  await stack.call('POST', '/api/auth/mappings', { cookie: alice, body: { awxOrg: 'X', role: 'admin' } });
  assert.ok(await waitForAudit((r) => r.path === '/api/auth/mappings' && r.status === 403));
});

/**
 * Attend la fin des écritures d'audit en arrière-plan. PGlite n'a qu'une
 * session, partagée entre l'API et les requêtes directes du test : une
 * requête directe envoyée pendant une transaction d'audit s'y exécuterait.
 */
const settleAudit = async () => {
  let previous = -1;
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    // eslint-disable-next-line no-await-in-loop
    const count = (await stack.db.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n;
    if (count === previous) return;
    previous = count;
  }
};

test('audit : ajout seul, chaîne vérifiable, altération détectée', async () => {
  await settleAudit();
  await assert.rejects(stack.db.query('UPDATE audit_log SET actor_name = $1', ['pirate']), /ajout seul/);
  await assert.rejects(stack.db.query('DELETE FROM audit_log'), /ajout seul/);

  const alice = await stack.login('alice');
  assert.equal((await stack.call('GET', '/api/system/audit', { cookie: alice })).status, 403);

  const list = await stack.call('GET', '/api/system/audit?limit=5', { cookie: admin });
  assert.equal(list.status, 200);
  assert.ok(list.body.length > 0);

  const ok = await stack.call('GET', '/api/system/audit/verify', { cookie: admin });
  assert.equal(ok.body.ok, true);

  // Altération directe en base (trigger contourné) : la chaîne est cassée.
  await settleAudit();
  await stack.db.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  const victim = (await stack.db.query('SELECT id FROM audit_log ORDER BY id LIMIT 1 OFFSET 1')).rows[0].id;
  await stack.db.query("UPDATE audit_log SET actor_name = 'pirate' WHERE id = $1", [victim]);
  await stack.db.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  const broken = await stack.call('GET', '/api/system/audit/verify', { cookie: admin });
  assert.equal(broken.body.ok, false);
  assert.equal(broken.body.brokenAt, Number(victim));
});

/* --- SSRF ------------------------------------------------------------------- */

test('SSRF : métadonnées cloud, link-local et hôtes hors liste refusés', async () => {
  const { probeEndpoint, isForbiddenAddress } = require('../src/endpointProbe');
  for (const ip of ['169.254.169.254', '0.0.0.0', '224.0.0.1', '::', 'fe80::1', '::ffff:169.254.169.254', 'fd00:ec2::254']) {
    assert.equal(isForbiddenAddress(ip), true, ip);
  }
  for (const ip of ['10.0.0.5', '192.168.1.10', '8.8.8.8']) assert.equal(isForbiddenAddress(ip), false, ip);

  const meta = await probeEndpoint('http://169.254.169.254/latest/meta-data/');
  assert.equal(meta.ok, false);
  assert.match(meta.error, /interdite/);

  process.env.CONNECTOR_ALLOWED_HOSTS = 'jenkins.acme.fr,*.ci.acme.fr';
  try {
    const outside = await probeEndpoint('http://intranet.acme.fr/');
    assert.match(outside.error, /CONNECTOR_ALLOWED_HOSTS/);
  } finally {
    delete process.env.CONNECTOR_ALLOWED_HOSTS;
  }
});

/* --- Configuration de production ------------------------------------------ */

const withEnv = (vars, fn) => {
  const saved = {};
  Object.keys(vars).forEach((key) => { saved[key] = process.env[key]; });
  Object.entries(vars).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    return fn();
  } finally {
    Object.entries(saved).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

const SAFE_PROD = {
  NODE_ENV: 'production',
  AUTH_MODE: 'awx',
  AWX_BASE_URL: 'https://ascender.acme.fr',
  AWX_CLIENT_ID: 'portal',
  AWX_CLIENT_SECRET: 'secret',
  PORTAL_URL: 'https://portail.acme.fr',
  AWX_REDIRECT_URI: 'https://portail.acme.fr/api/auth/callback',
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  PG_SSL: 'true',
  PG_SSL_REJECT_UNAUTHORIZED: undefined,
  COOKIE_SECURE: 'true',
  ALLOWED_ORIGINS: '',
  RESEND_API_KEY: undefined,
};

test('production : configuration sûre acceptée, chaque écart refusé', () => {
  const { configProblems } = require('../src/security');
  assert.deepEqual(withEnv(SAFE_PROD, configProblems), []);
  const cases = {
    AUTH_MODE: 'disabled',
    AWX_BASE_URL: 'http://ascender.acme.fr',
    PORTAL_URL: '',
    AWX_REDIRECT_URI: 'https://evil.example/api/auth/callback',
    TOKEN_ENCRYPTION_KEY: '',
    PG_SSL: 'false',
    PG_SSL_REJECT_UNAUTHORIZED: 'false',
    COOKIE_SECURE: 'false',
    ALLOWED_ORIGINS: '*',
    RESEND_API_KEY: 're_123',
  };
  Object.entries(cases).forEach(([key, value]) => {
    const problems = withEnv({ ...SAFE_PROD, [key]: value }, configProblems);
    assert.ok(problems.length > 0, `${key}=${value} devrait être refusé`);
  });
  assert.deepEqual(withEnv({ ...SAFE_PROD, RESEND_API_KEY: 're_123', ALLOW_EXTERNAL_MAIL: 'true' }, configProblems), []);
});

/* --- Chiffrement : rotation de clé ----------------------------------------- */

test('rotation de clé : ancienne clé relue, nouvelle utilisée, clair refusé en production', () => {
  const secrets = require('../src/secrets');
  const oldKey = crypto.randomBytes(32).toString('base64');
  const newKey = crypto.randomBytes(32).toString('base64');

  const sealed = withEnv({ TOKEN_ENCRYPTION_KEY: oldKey }, () => secrets.encrypt('jeton'));
  withEnv({ TOKEN_ENCRYPTION_KEY: newKey, TOKEN_ENCRYPTION_KEYS_PREVIOUS: oldKey }, () => {
    assert.equal(secrets.decrypt(sealed), 'jeton');
    assert.equal(secrets.needsRotation(sealed), true);
    const resealed = secrets.encrypt(secrets.decrypt(sealed));
    assert.equal(secrets.needsRotation(resealed), false);
  });
  withEnv({ TOKEN_ENCRYPTION_KEY: newKey, TOKEN_ENCRYPTION_KEYS_PREVIOUS: '', AWX_CLIENT_SECRET: '' }, () => {
    assert.equal(secrets.decrypt(sealed), '', 'clé retirée : illisible');
  });
  withEnv({ NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: newKey }, () => {
    assert.equal(secrets.decrypt('tok-en-clair'), '');
  });
});
