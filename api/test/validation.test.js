const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');
const { validatePayload } = require('../src/formValidation');

let stack;
let admin;
let alice;

test.before(async () => {
  stack = await startStack();
  admin = await stack.login('admin');
  alice = await stack.login('alice');
  await stack.call('PATCH', '/api/admin/services/create-dns-record', { cookie: admin, body: { kind: 'job', templateId: 9 } });
});

test.after(async () => {
  await stack.stop();
});

const order = (payload, serviceId = 'create-dns-record', cookie = alice) => stack.call('POST', '/api/requests', {
  cookie, body: { serviceId, payload },
});

test('champ obligatoire manquant : 422 avec le détail par champ', async () => {
  const { fqdn, ...rest } = PAYLOADS['create-dns-record'];
  const res = await order(rest);
  assert.equal(res.status, 422);
  assert.equal(res.body.error, 'invalid_payload');
  assert.deepEqual(res.body.fields, [{ field: 'fqdn', key: 'form_required' }]);
});

test('valeur hors des options proposées : refusée', async () => {
  const res = await order({ ...PAYLOADS['create-dns-record'], zone: 'evil.example.com' });
  assert.equal(res.status, 422);
  assert.equal(res.body.fields[0].key, 'err_option');
});

test('format invalide (FQDN) : refusé', async () => {
  const res = await order({ ...PAYLOADS['create-dns-record'], fqdn: 'pas un nom' });
  assert.equal(res.status, 422);
  assert.equal(res.body.fields[0].key, 'err_fqdn');
});

test('champs inconnus retirés avant stockage et envoi à Ascender', async () => {
  const res = await order({ ...PAYLOADS['create-dns-record'], ansible_become_pass: 'x', extra: { nested: true } });
  assert.equal(res.status, 201);
  const stored = await stack.db.query('SELECT payload FROM requests WHERE id = $1', [res.body.id]);
  assert.deepEqual(Object.keys(stored.rows[0].payload).sort(), ['fqdn', 'record_type', 'value', 'zone']);
  const sent = stack.ascender.state.launches.at(-1).body.extra_vars.portal_request_payload;
  assert.equal(sent.ansible_become_pass, undefined);
  assert.equal(sent.extra, undefined);
});

test('RBAC Ascender vérifié à la commande', async () => {
  // Le template 7 n'est visible que par admin dans le faux Ascender.
  await stack.call('PATCH', '/api/admin/services/create-linux-server', { cookie: admin, body: { kind: 'job', templateId: 7 } });
  const res = await order(PAYLOADS['create-linux-server'], 'create-linux-server');
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'service_forbidden');
});

test('validatePayload : types et bornes', () => {
  const fields = [
    { name: 'cpu', type: 'integer', required: true, validation: { min: 1, max: 32 } },
    { name: 'tags', type: 'tags' },
    { name: 'ok', type: 'checkbox' },
    { name: 'server', type: 'autocomplete', options: [{ value: 'a' }] },
  ];
  assert.deepEqual(validatePayload(fields, { cpu: '4', server: 'libre' }).values, { cpu: 4, ok: false, server: 'libre' });
  assert.equal(validatePayload(fields, { cpu: 64 }).errors[0].key, 'err_max');
  assert.equal(validatePayload(fields, { cpu: 2.5 }).errors[0].key, 'err_integer');
  assert.equal(validatePayload(fields, { cpu: 2, tags: [1, 2] }).errors[0].key, 'err_type');
  assert.equal(validatePayload(fields, { cpu: 2, ok: 'yes' }).errors[0].key, 'err_type');
});
