const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');

let stack;
let admin;
let alice;

test.before(async () => {
  stack = await startStack();
  admin = await stack.login('admin');
  alice = await stack.login('alice');
  // DNS → template 9 (projet « network-dns »), serveur Linux → template 7
  // (projet « infra-provisioning », admin seulement), application → workflow 20.
  await stack.call('PATCH', '/api/admin/services/create-dns-record', { cookie: admin, body: { kind: 'job', templateId: 9 } });
  await stack.call('PATCH', '/api/admin/services/create-linux-server', { cookie: admin, body: { kind: 'job', templateId: 7 } });
  await stack.call('PATCH', '/api/admin/services/deploy-application', { cookie: admin, body: { kind: 'workflow', templateId: 20 } });
});

test.after(async () => {
  await stack.stop();
});

const projectOf = (services, id) => services.find((s) => s.id === id)?.project;

test('les projets sont ceux des job templates dans Ascender', async () => {
  const res = await stack.call('GET', '/api/projects', { cookie: admin });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    { id: '31', name: 'infra-provisioning' },
    { id: '32', name: 'network-dns' },
  ]);
});

test('chaque service porte le projet de son job template', async () => {
  const { body } = await stack.call('GET', '/api/services', { cookie: admin });
  assert.deepEqual(projectOf(body, 'create-dns-record'), { id: '32', name: 'network-dns' });
  assert.deepEqual(projectOf(body, 'create-linux-server'), { id: '31', name: 'infra-provisioning' });
  // Un workflow n'a pas de projet dans Ascender ; un service non relié non plus.
  assert.equal(projectOf(body, 'deploy-application'), null);
  assert.equal(projectOf(body, 'add-monitoring'), null);

  const detail = await stack.call('GET', '/api/services/create-dns-record', { cookie: admin });
  assert.deepEqual(detail.body.project, { id: '32', name: 'network-dns' });
});

test('filtre par projet Ascender', async () => {
  const { body } = await stack.call('GET', '/api/services?project=31', { cookie: admin });
  assert.deepEqual(body.map((s) => s.id), ['create-linux-server']);
});

test('un utilisateur ne voit que les projets de ses templates accessibles', async () => {
  const projects = await stack.call('GET', '/api/projects', { cookie: alice });
  assert.deepEqual(projects.body, [{ id: '32', name: 'network-dns' }]);
});
