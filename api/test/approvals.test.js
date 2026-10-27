const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');

let stack;
let admin;
let alice;
let bob;

test.before(async () => {
  stack = await startStack();
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')",
  );
  await stack.linkTenant('Infra');
  admin = await stack.login('admin');
  alice = await stack.login('alice');
  bob = await stack.login('bob');
  // Le template 9 (visible par tous) sert aux trois services testés.
  for (const service of ['create-dns-record', 'create-linux-server', 'delete-server']) {
    // eslint-disable-next-line no-await-in-loop
    const res = await stack.call('PATCH', `/api/admin/services/${service}`, {
      cookie: admin, body: { kind: 'job', templateId: 9 },
    });
    assert.equal(res.status, 200, `affectation ${service}`);
  }
});

test.after(async () => {
  await stack.stop();
});

const order = (cookie, serviceId, environment = 'dev') => stack.call('POST', '/api/requests', {
  cookie, body: { serviceId, environment, payload: { ...PAYLOADS[serviceId], justification: 'test' } },
});

test('service sans approbation : job lancé immédiatement avec le jeton du demandeur', async () => {
  const res = await order(alice, 'create-dns-record');
  assert.equal(res.status, 201);
  assert.equal(res.body.approvalId, null);
  assert.ok(res.body.awxLaunch.jobId > 0);
  assert.equal(stack.ascender.state.launches.at(-1).user, 'alice');
});

test('service soumis à approbation : aucun lancement avant la décision', async () => {
  const before = stack.ascender.state.launches.length;
  const res = await order(alice, 'create-linux-server', 'prod');
  assert.equal(res.status, 201);
  assert.ok(res.body.approvalId);
  assert.equal(res.body.awxLaunch, null);
  assert.equal(stack.ascender.state.launches.length, before);

  const launch = await stack.call('POST', `/api/requests/${res.body.id}/awx/launch`, { cookie: alice });
  assert.equal(launch.status, 409);
  assert.equal(launch.body.error, 'approval_pending');

  const approval = await stack.call('GET', `/api/approvals/${res.body.approvalId}`, { cookie: bob });
  assert.equal(approval.body.risk, 'high');
  assert.deepEqual(approval.body.levels.map((l) => l.status), ['current']);
});

test('un demandeur ne peut pas décider', async () => {
  const res = await order(alice, 'create-linux-server');
  const decision = await stack.call('POST', `/api/approvals/${res.body.approvalId}/decision`, {
    cookie: alice, body: { decision: 'approved' },
  });
  assert.equal(decision.status, 403);
});

test('personne ne peut approuver sa propre demande', async () => {
  const res = await order(bob, 'create-linux-server');
  const decision = await stack.call('POST', `/api/approvals/${res.body.approvalId}/decision`, {
    cookie: bob, body: { decision: 'approved' },
  });
  assert.equal(decision.status, 403);
  assert.equal(decision.body.error, 'self_approval_forbidden');
});

test('approbation finale : job lancé avec le jeton du demandeur, auteur = session', async () => {
  const res = await order(alice, 'create-linux-server');
  const decision = await stack.call('POST', `/api/approvals/${res.body.approvalId}/decision`, {
    // actorId envoyé par le client : doit être ignoré.
    cookie: bob, body: { decision: 'approved', comment: 'OK', actorId: 'u-camille' },
  });
  assert.equal(decision.status, 200);
  assert.equal(decision.body.granted, true);
  assert.ok(decision.body.launch.jobId > 0);
  assert.equal(stack.ascender.state.launches.at(-1).user, 'alice');

  const request = await stack.call('GET', `/api/requests/${res.body.id}`, { cookie: alice });
  assert.equal(request.body.approvalState, 'granted');

  const audit = await stack.db.query('SELECT actor_id FROM audit_events WHERE ref = $1', [res.body.id]);
  assert.equal(audit.rows[0].actor_id, 'u-awx-3');

  const again = await stack.call('POST', `/api/approvals/${res.body.approvalId}/decision`, {
    cookie: admin, body: { decision: 'rejected' },
  });
  assert.equal(again.status, 409);
});

test('circuit multi-niveaux : refus au 2e niveau, demande annulée', async () => {
  const before = stack.ascender.state.launches.length;
  const res = await order(alice, 'delete-server');
  const first = await stack.call('POST', `/api/approvals/${res.body.approvalId}/decision`, {
    cookie: bob, body: { decision: 'approved' },
  });
  assert.equal(first.body.final, false);
  assert.equal(first.body.nextLevel, 'technical');

  const second = await stack.call('POST', `/api/approvals/${res.body.approvalId}/decision`, {
    cookie: admin, body: { decision: 'rejected', comment: 'Pas maintenant' },
  });
  assert.equal(second.body.final, true);
  assert.equal(second.body.granted, false);
  assert.deepEqual(second.body.approval.levels.map((l) => l.status), ['approved', 'rejected', 'skipped']);
  assert.equal(stack.ascender.state.launches.length, before);

  const request = await stack.call('GET', `/api/requests/${res.body.id}`, { cookie: alice });
  assert.equal(request.body.status, 'canceled');
  assert.equal(request.body.approvalState, 'rejected');
});
