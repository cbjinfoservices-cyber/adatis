const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');

let stack;
let admin;
let requester;
let projectManager;

test.before(async () => {
  stack = await startStack();
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Project Managers', 'project_manager')",
  );
  admin = await stack.login('admin');
  requester = await stack.login('alice');
  projectManager = await stack.login('dave');

  await stack.call('PATCH', '/api/admin/services/create-dns-record', {
    cookie: admin, body: { kind: 'job', templateId: 9 },
  });
  await stack.call('PATCH', '/api/admin/services/create-linux-server', {
    cookie: admin, body: { kind: 'job', templateId: 11 },
  });
  const saved = await stack.call('PATCH', '/api/admin/template-visibility/job/9', {
    cookie: admin, body: { projectId: 32, roles: ['project_manager'] },
  });
  assert.equal(saved.status, 200);
});

test.after(async () => {
  await stack.stop();
});

test('un rôle project_manager est attribué depuis un mapping AWX équipe', async () => {
  const me = await stack.call('GET', '/api/auth/me', { cookie: projectManager });
  assert.equal(me.body.user.role, 'project_manager');
  assert.equal(me.body.permissions.canAdmin, false);
  assert.equal(me.body.permissions.canApprove, false);
});

test('une règle masque un modèle du même projet sans masquer les autres', async () => {
  const requesterCatalog = await stack.call('GET', '/api/services', { cookie: requester });
  assert.equal(requesterCatalog.status, 200);
  assert.ok(!requesterCatalog.body.some((service) => service.id === 'create-dns-record'));
  assert.ok(requesterCatalog.body.some((service) => service.id === 'create-linux-server'));

  const managerCatalog = await stack.call('GET', '/api/services', { cookie: projectManager });
  assert.equal(managerCatalog.status, 200);
  assert.ok(managerCatalog.body.some((service) => service.id === 'create-dns-record'));
  assert.ok(managerCatalog.body.some((service) => service.id === 'create-linux-server'));
});

test('les mêmes règles sont vérifiées sur la fiche et à la création de demande', async () => {
  const hidden = await stack.call('GET', '/api/services/create-dns-record', { cookie: requester });
  assert.equal(hidden.status, 403);
  const denied = await stack.call('POST', '/api/requests', {
    cookie: requester, body: { serviceId: 'create-dns-record', payload: PAYLOADS['create-dns-record'] },
  });
  assert.equal(denied.status, 403);

  const allowed = await stack.call('POST', '/api/requests', {
    cookie: projectManager, body: { serviceId: 'create-dns-record', payload: PAYLOADS['create-dns-record'] },
  });
  assert.equal(allowed.status, 201);
  assert.equal(allowed.body.awxLaunch.jobId, 100);
});

test('un non-administrateur ne peut pas modifier la configuration RBAC', async () => {
  const denied = await stack.call('PATCH', '/api/admin/template-visibility/job/9', {
    cookie: projectManager, body: { projectId: 32, roles: ['requester'] },
  });
  assert.equal(denied.status, 403);
});

test('sans réponse Ascender, catalogue et demande échouent de manière fermée', async () => {
  const freshUser = await stack.login('carol');
  stack.ascender.setDown(true);
  try {
    const catalog = await stack.call('GET', '/api/services', { cookie: freshUser });
    assert.equal(catalog.status, 503);
    assert.equal(catalog.body.error, 'awx_access_unavailable');

    const request = await stack.call('POST', '/api/requests', {
      cookie: freshUser, body: { serviceId: 'create-dns-record', payload: PAYLOADS['create-dns-record'] },
    });
    assert.equal(request.status, 503);
    assert.equal(request.body.error, 'awx_access_unavailable');
  } finally {
    stack.ascender.setDown(false);
  }
});

test('supprimer une règle rétablit le filtre AWX seul', async () => {
  const deleted = await stack.call('DELETE', '/api/admin/template-visibility/job/9', { cookie: admin });
  assert.equal(deleted.status, 204);
  const catalog = await stack.call('GET', '/api/services', { cookie: requester });
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.some((service) => service.id === 'create-dns-record'));
});
