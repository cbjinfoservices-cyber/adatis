const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');

const DEPLOY = { application: 'crm', environment: 'dev', version: '1.4.2' };

let stack;
let admin;
let alice;
let dnsRequest;
let deployRequest;

test.before(async () => {
  stack = await startStack();
  await stack.db.query(`
    INSERT INTO connectors (id, kind, name, endpoint, endpoint_default) VALUES
      ('cn-jen-02', 'jenkins', 'Jenkins Build Service', '—', '—'),
      ('cn-tf-03', 'terraform', 'Terraform Cloud', '—', '—');
  `);
  admin = await stack.login('admin');
  alice = await stack.login('alice');
  await stack.call('PATCH', '/api/admin/services/create-dns-record', { cookie: admin, body: { kind: 'job', templateId: 9 } });
});

test.after(async () => {
  await stack.stop();
});

test('services rattachés à Ascender par défaut ; connecteurs listés', async () => {
  const res = await stack.call('GET', '/api/admin/services', { cookie: admin });
  assert.ok(res.body.items.every((s) => s.connector?.kind === 'ascender'));
  const kinds = res.body.connectors.map((c) => `${c.kind}:${c.wired}`);
  assert.deepEqual(kinds.sort(), ['ascender:true', 'jenkins:false', 'terraform:false']);
});

test('changer de moteur retire le modèle Ascender ; un modèle ramène sur Ascender', async () => {
  await stack.call('PATCH', '/api/admin/services/deploy-application', { cookie: admin, body: { kind: 'job', templateId: 9 } });
  const moved = await stack.call('PATCH', '/api/admin/services/deploy-application/connector', {
    cookie: admin, body: { connectorId: 'cn-jen-02' },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.connector.kind, 'jenkins');
  assert.equal(moved.body.kind, 'none');

  const unknown = await stack.call('PATCH', '/api/admin/services/deploy-application/connector', {
    cookie: admin, body: { connectorId: 'cn-inconnu' },
  });
  assert.equal(unknown.status, 404);

  const denied = await stack.call('PATCH', '/api/admin/services/deploy-application/connector', {
    cookie: alice, body: { connectorId: 'cn-ascender' },
  });
  assert.equal(denied.status, 403);
});

test('commande : moteur mémorisé, seul Ascender lance un job', async () => {
  const before = stack.ascender.state.launches.length;
  const dns = await stack.call('POST', '/api/requests', { cookie: alice, body: { serviceId: 'create-dns-record', payload: PAYLOADS['create-dns-record'] } });
  assert.equal(dns.body.engine.kind, 'ascender');
  assert.ok(dns.body.awxLaunch.jobId > 0);

  const deploy = await stack.call('POST', '/api/requests', { cookie: alice, body: { serviceId: 'deploy-application', payload: DEPLOY } });
  assert.equal(deploy.status, 201);
  assert.equal(deploy.body.engine.kind, 'jenkins');
  assert.equal(deploy.body.engine.connectorName, 'Jenkins Build Service');
  assert.equal(deploy.body.awxLaunch, null);
  assert.equal(stack.ascender.state.launches.length, before + 1);

  const launch = await stack.call('POST', `/api/requests/${deploy.body.id}/awx/launch`, { cookie: alice });
  assert.equal(launch.status, 409);
  assert.equal(launch.body.error, 'engine_not_wired');

  dnsRequest = dns.body.id;
  deployRequest = deploy.body.id;
});

test('suivi des jobs scindé par type de connecteur', async () => {
  const all = await stack.call('GET', '/api/jobs', { cookie: alice });
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.kinds, ['ascender', 'jenkins', 'terraform']);
  assert.equal(all.body.stats.total, 2);
  assert.equal(all.body.byKind.ascender.total, 1);
  assert.equal(all.body.byKind.ascender.wired, true);
  assert.equal(all.body.byKind.jenkins.total, 1);
  assert.equal(all.body.byKind.jenkins.notWired, 1);
  assert.equal(all.body.byKind.terraform.total, 0);

  const deployRow = all.body.items.find((i) => i.id === deployRequest);
  assert.equal(deployRow.portalStatus, 'not_wired');

  const jenkins = await stack.call('GET', '/api/jobs?kind=jenkins', { cookie: alice });
  assert.deepEqual(jenkins.body.items.map((i) => i.id), [deployRequest]);

  const legacy = await stack.call('GET', '/api/awx/jobs?kind=ascender', { cookie: alice });
  assert.deepEqual(legacy.body.items.map((i) => i.id), [dnsRequest]);

  const byName = await stack.call('GET', '/api/jobs?search=jenkins', { cookie: alice });
  assert.deepEqual(byName.body.items.map((i) => i.id), [deployRequest]);
});
