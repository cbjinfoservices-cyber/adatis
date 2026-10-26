const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');

let stack;
let admin;
let bob;

test.before(async () => {
  stack = await startStack();
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')",
  );
  admin = await stack.login('admin');
  bob = await stack.login('bob');
  await stack.call('PATCH', '/api/admin/services/create-linux-server', { cookie: admin, body: { kind: 'job', templateId: 9 } });
});

test.after(async () => {
  await stack.stop();
});

const orderAs = async (cookie) => (await stack.call('POST', '/api/requests', {
  cookie, body: { serviceId: 'create-linux-server', payload: PAYLOADS['create-linux-server'] },
})).body;

const approve = (approvalId) => stack.call('POST', `/api/approvals/${approvalId}/decision`, {
  cookie: bob, body: { decision: 'approved' },
});

test('session expirée du demandeur : refusée, mais le job part après approbation', async () => {
  const alice = await stack.login('alice');
  const req = await orderAs(alice);
  await stack.db.query(
    `UPDATE auth_sessions SET expires_at = now() - interval '2 hours', access_expires_at = now() - interval '2 hours'
      WHERE awx_username = 'alice'`,
  );
  const denied = await stack.call('GET', '/api/requests', { cookie: alice });
  assert.equal(denied.status, 401);

  const decision = await approve(req.approvalId);
  assert.ok(decision.body.launch.jobId > 0, JSON.stringify(decision.body.launch));
  assert.equal(stack.ascender.state.launches.at(-1).user, 'alice');
});

test('après déconnexion : demande en attente du demandeur, qui la lance lui-même', async () => {
  const alice = await stack.login('alice');
  const req = await orderAs(alice);
  await stack.call('POST', '/api/auth/logout', { cookie: alice });
  // Les anciennes sessions expirées d'alice sont aussi hors délai de grâce.
  await stack.db.query("UPDATE auth_sessions SET expires_at = now() - interval '30 days' WHERE awx_username = 'alice'");

  const decision = await approve(req.approvalId);
  assert.equal(decision.body.launch.skipped, 'requester_session_missing');

  const again = await stack.login('alice');
  const detail = await stack.call('GET', `/api/requests/${req.id}`, { cookie: again });
  assert.equal(detail.body.awaitingRequester, true);

  const launch = await stack.call('POST', `/api/requests/${req.id}/awx/launch`, { cookie: again });
  assert.equal(launch.status, 200);
  assert.ok(launch.body.awx.jobId > 0);
});

test('purge : seules les sessions expirées au-delà du délai de grâce disparaissent', async () => {
  const { purgeSessions } = require('../src/auth');
  await stack.login('carol');
  await stack.db.query("UPDATE auth_sessions SET expires_at = now() - interval '3 days' WHERE awx_username = 'carol'");
  await purgeSessions();
  const kept = await stack.db.query("SELECT count(*)::int AS n FROM auth_sessions WHERE awx_username = 'carol'");
  assert.equal(kept.rows[0].n, 1);
  const old = await stack.db.query("SELECT count(*)::int AS n FROM auth_sessions WHERE awx_username = 'alice' AND expires_at < now() - interval '7 days'");
  assert.equal(old.rows[0].n, 0);
});
