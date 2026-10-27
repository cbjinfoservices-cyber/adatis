const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');

let stack;
let admin;

test.before(async () => {
  stack = await startStack();
  await stack.db.exec(`
    INSERT INTO tenants (id, name, platform_name) VALUES
      ('acme', 'Acme Corp', 'Acme Automation'),
      ('contoso', 'Contoso Industries', 'Contoso Cloud Ops');
    INSERT INTO requests (id, service_id, tenant_id) VALUES
      ('REQ-CONTOSO-1', 'create-dns-record', 'contoso');
  `);
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')",
  );
  admin = await stack.login('admin');
});

test.after(async () => {
  await stack.stop();
});

test('une organisation Ascender ne peut être reliée qu’à un seul tenant', async () => {
  const linked = await stack.call('PATCH', '/api/tenants/acme', { cookie: admin, body: { awxOrganization: ' Infra ' } });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.awxOrganization, 'Infra');

  const others = await stack.db.query("SELECT id FROM tenants WHERE id <> 'acme' LIMIT 1");
  const taken = await stack.call('PATCH', `/api/tenants/${others.rows[0].id}`, { cookie: admin, body: { awxOrganization: 'infra' } });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.error, 'organization_taken');
});

test('à la connexion, le tenant est déduit de l’organisation Ascender', async () => {
  const bob = await stack.login('bob');
  const me = await stack.call('GET', '/api/auth/me', { cookie: bob });
  assert.equal(me.body.user.tenantId, 'acme');
});

test('demandes rattachées au tenant ; l’approbateur ne voit que son tenant', async () => {
  const alice = await stack.login('alice');
  await stack.call('PATCH', '/api/admin/services/create-dns-record', { cookie: admin, body: { kind: 'job', templateId: 9 } });
  const created = await stack.call('POST', '/api/requests', {
    cookie: alice, body: { serviceId: 'create-dns-record', payload: PAYLOADS['create-dns-record'] },
  });
  assert.equal(created.status, 201);
  const stored = await stack.db.query('SELECT tenant_id FROM requests WHERE id = $1', [created.body.id]);
  assert.equal(stored.rows[0].tenant_id, 'acme');

  const bob = await stack.login('bob');
  const list = await stack.call('GET', '/api/requests?limit=200', { cookie: bob });
  const ids = list.body.map((r) => r.id);
  assert.ok(ids.includes(created.body.id));
  const tenants = await stack.db.query('SELECT DISTINCT tenant_id FROM requests WHERE id = ANY($1)', [ids]);
  assert.deepEqual(tenants.rows.map((r) => r.tenant_id), ['acme']);

  // La demande du tenant contoso existe mais reste invisible pour bob.
  const all = await stack.db.query("SELECT count(*)::int AS n FROM requests WHERE tenant_id <> 'acme'");
  assert.ok(all.rows[0].n > 0);
});
