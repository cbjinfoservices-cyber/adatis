const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');

let stack;

test.before(async () => {
  stack = await startStack();
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')",
  );
});

test.after(async () => {
  await stack.stop();
});

test('sans session, les routes protégées répondent 401', async () => {
  const res = await stack.call('GET', '/api/requests');
  assert.equal(res.status, 401);
});

test('la sonde publique répond sans session', async () => {
  const res = await stack.call('GET', '/api/system/health');
  assert.equal(res.status, 200);
});

test('SSO : identité lue sur /api/v2/me/ paginé, rôles déduits', async () => {
  const admin = await stack.login('admin');
  const me = await stack.call('GET', '/api/auth/me', { cookie: admin });
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.user.role, 'admin');
  assert.deepEqual(me.body.user.organizations, ['Infra']);

  const bob = await stack.login('bob');
  const bobMe = await stack.call('GET', '/api/auth/me', { cookie: bob });
  assert.equal(bobMe.body.user.role, 'approver');
  assert.deepEqual(bobMe.body.user.teams, ['Approvers']);

  const alice = await stack.login('alice');
  const aliceMe = await stack.call('GET', '/api/auth/me', { cookie: alice });
  assert.equal(aliceMe.body.user.role, 'requester');
});

test('un demandeur ne peut pas écrire dans l’administration', async () => {
  const alice = await stack.login('alice');
  const res = await stack.call('POST', '/api/adapters', { cookie: alice, body: { kind: 'x', name: 'X' } });
  assert.equal(res.status, 403);
});

test('AUTH_MODE=awx avec configuration incomplète : portail fermé (503)', async () => {
  const saved = process.env.AWX_CLIENT_SECRET;
  process.env.AWX_CLIENT_SECRET = '';
  try {
    const config = await stack.call('GET', '/api/auth/config');
    assert.equal(config.body.mode, 'misconfigured');
    const res = await stack.call('GET', '/api/services');
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'auth_misconfigured');
    const login = await stack.call('GET', '/api/auth/login');
    assert.equal(login.status, 302);
    assert.match(login.headers.get('location'), /auth_error=misconfigured/);
  } finally {
    process.env.AWX_CLIENT_SECRET = saved;
  }
});

test('AUTH_MODE=disabled : portail ouvert (mode développement)', async () => {
  process.env.AUTH_MODE = 'disabled';
  try {
    const res = await stack.call('GET', '/api/services');
    assert.equal(res.status, 200);
  } finally {
    process.env.AUTH_MODE = 'awx';
  }
});
