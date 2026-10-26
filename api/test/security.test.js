const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');

let stack;

test.before(async () => {
  stack = await startStack({ RATE_LIMIT_LOGIN: '8', ALLOWED_ORIGINS: '' });
});

test.after(async () => {
  await stack.stop();
});

test('jetons Ascender chiffrés en base et toujours utilisables', async () => {
  const cookie = await stack.login('admin');
  const { rows } = await stack.db.query('SELECT access_token, refresh_token FROM auth_sessions');
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.match(row.access_token, /^v1:/);
    assert.ok(!row.access_token.includes('tok-'));
    assert.match(row.refresh_token, /^v1:/);
  }
  const identity = await stack.call('GET', '/api/auth/identity', { cookie });
  assert.equal(identity.status, 200);
  assert.equal(identity.body.username, 'admin');
});

test('jeton historique stocké en clair : encore lisible', async () => {
  const cookie = await stack.login('alice');
  await stack.db.query("UPDATE auth_sessions SET access_token = 'tok-alice' WHERE awx_username = 'alice'");
  const identity = await stack.call('GET', '/api/auth/identity', { cookie });
  assert.equal(identity.status, 200);
  assert.equal(identity.body.username, 'alice');
});

test('en-têtes de sécurité, pas de X-Powered-By', async () => {
  const res = await stack.call('GET', '/api/system/health');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('CORS : aucune origine tierce autorisée par défaut', async () => {
  const res = await fetch(`${stack.base}/api/system/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('JSON invalide : 400 et non 500', async () => {
  const cookie = await stack.login('admin');
  const res = await fetch(`${stack.base}/api/requests`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{pas du json',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_json');
});

test('limitation de débit sur la connexion', async () => {
  let limited = false;
  for (let i = 0; i < 12 && !limited; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${stack.base}/api/auth/login`, { redirect: 'manual' });
    limited = res.status === 429;
  }
  assert.ok(limited, 'la 9e tentative doit être refusée');
});
