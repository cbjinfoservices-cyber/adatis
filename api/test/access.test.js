const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');

let stack;
let admin;
let alice;
let bob;
let carol;
let aliceReq;
let carolReq;

test.before(async () => {
  stack = await startStack();
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')",
  );
  admin = await stack.login('admin');
  alice = await stack.login('alice');
  bob = await stack.login('bob');
  carol = await stack.login('carol');
  await stack.call('PATCH', '/api/admin/services/create-dns-record', { cookie: admin, body: { kind: 'job', templateId: 9 } });
  await stack.call('PATCH', '/api/admin/services/create-linux-server', { cookie: admin, body: { kind: 'job', templateId: 9 } });

  const order = (cookie, serviceId) => stack.call('POST', '/api/requests', { cookie, body: { serviceId, payload: {} } });
  aliceReq = (await order(alice, 'create-dns-record')).body.id;
  carolReq = (await order(carol, 'create-dns-record')).body.id;
  // Une approbation décidée par bob sur la demande de carol (pour l'audit).
  const pending = await order(carol, 'create-linux-server');
  await stack.call('POST', `/api/approvals/${pending.body.approvalId}/decision`, { cookie: bob, body: { decision: 'approved' } });
});

test.after(async () => {
  await stack.stop();
});

test('un demandeur ne voit que ses demandes', async () => {
  const list = await stack.call('GET', '/api/requests?limit=200', { cookie: alice });
  assert.equal(list.status, 200);
  assert.ok(list.body.length >= 1);
  assert.ok(list.body.every((r) => r.id !== carolReq));
  assert.ok(list.body.some((r) => r.id === aliceReq));
  // Les demandes de démonstration (autres utilisateurs) sont exclues.
  assert.ok(list.body.every((r) => !r.id.startsWith('REQ-2026-48')));
});

test('la recherche reste limitée au périmètre', async () => {
  const mine = await stack.call('GET', `/api/requests?q=${aliceReq}`, { cookie: alice });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.map((r) => r.id), [aliceReq]);
  const other = await stack.call('GET', `/api/requests?q=${carolReq}`, { cookie: alice });
  assert.deepEqual(other.body, []);
  const byName = await stack.call('GET', '/api/requests?q=Carol', { cookie: admin });
  assert.ok(byName.body.some((r) => r.id === carolReq));
});

test('la fiche d’une autre personne répond 404', async () => {
  const read = await stack.call('GET', `/api/requests/${carolReq}`, { cookie: alice });
  assert.equal(read.status, 404);
  const sync = await stack.call('POST', `/api/requests/${carolReq}/awx/sync`, { cookie: alice });
  assert.equal(sync.status, 404);
});

test('jobs, approbations et audit filtrés pour un demandeur', async () => {
  const jobs = await stack.call('GET', '/api/awx/jobs', { cookie: alice });
  assert.deepEqual(jobs.body.items.map((i) => i.id), [aliceReq]);

  const approvals = await stack.call('GET', '/api/approvals', { cookie: alice });
  assert.equal(approvals.body.length, 0);

  const audit = await stack.call('GET', '/api/audit', { cookie: alice });
  assert.equal(audit.body.length, 0);

  const carolAudit = await stack.call('GET', '/api/audit', { cookie: carol });
  assert.equal(carolAudit.body.length, 1);
});

test('approbateur (sans tenant) et administrateur voient tout', async () => {
  for (const cookie of [bob, admin]) {
    // eslint-disable-next-line no-await-in-loop
    const list = await stack.call('GET', '/api/requests?limit=200', { cookie });
    const ids = list.body.map((r) => r.id);
    assert.ok(ids.includes(aliceReq) && ids.includes(carolReq));
  }
});

test('forcer le statut d’une demande est réservé aux administrateurs', async () => {
  const denied = await stack.call('PATCH', `/api/requests/${aliceReq}`, { cookie: alice, body: { status: 'success' } });
  assert.equal(denied.status, 403);
  const ok = await stack.call('PATCH', `/api/requests/${aliceReq}`, { cookie: admin, body: { progress: 50 } });
  assert.equal(ok.status, 200);
});
