const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');

let stack;
let admin;
let alice;

const DEPLOY = {
  application: 'crm', environment: 'dev', version: '1.4.2', secret_token: 's3cr3t-valeur',
};

test.before(async () => {
  stack = await startStack();
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')",
  );
  await stack.linkTenant('Infra');
  admin = await stack.login('admin');
  alice = await stack.login('alice');
  await stack.call('PATCH', '/api/admin/services/deploy-application', { cookie: admin, body: { kind: 'job', templateId: 9 } });
});

test.after(async () => {
  await stack.stop();
});

const storedPayload = async (id) => (await stack.db.query('SELECT payload FROM requests WHERE id = $1', [id])).rows[0].payload;

test('champ mot de passe : chiffré en base, en clair seulement vers Ascender', async () => {
  const res = await stack.call('POST', '/api/requests', { cookie: alice, body: { serviceId: 'deploy-application', payload: DEPLOY } });
  assert.equal(res.status, 201);

  const payload = await storedPayload(res.body.id);
  assert.equal(payload.version, '1.4.2');
  assert.match(payload.secret_token.$secret, /^v2:[0-9a-f]{8}:/);
  assert.ok(!JSON.stringify(payload).includes('s3cr3t'));

  const sent = stack.ascender.state.launches.at(-1).body.extra_vars.portal_request_payload;
  assert.equal(sent.secret_token, 's3cr3t-valeur');

  // Jamais renvoyé par l'API.
  const read = await stack.call('GET', `/api/requests/${res.body.id}`, { cookie: alice });
  assert.ok(!JSON.stringify(read.body).includes('s3cr3t'));
});

test('après approbation, le secret est déchiffré depuis la base', async () => {
  await stack.db.query("UPDATE services SET approval = 'manager' WHERE id = 'deploy-application'");
  const res = await stack.call('POST', '/api/requests', { cookie: alice, body: { serviceId: 'deploy-application', payload: DEPLOY } });
  assert.ok(res.body.approvalId);

  const bob = await stack.login('bob');
  const decision = await stack.call('POST', `/api/approvals/${res.body.approvalId}/decision`, { cookie: bob, body: { decision: 'approved' } });
  assert.ok(decision.body.launch.jobId > 0);
  assert.equal(stack.ascender.state.launches.at(-1).body.extra_vars.portal_request_payload.secret_token, 's3cr3t-valeur');
});

test('sans clé de chiffrement, la valeur secrète n’est pas conservée', () => {
  const { sealSecrets, revealSecrets } = require('../src/secrets');
  const saved = { key: process.env.TOKEN_ENCRYPTION_KEY, secret: process.env.AWX_CLIENT_SECRET };
  delete process.env.TOKEN_ENCRYPTION_KEY;
  process.env.AWX_CLIENT_SECRET = '';
  try {
    assert.deepEqual(sealSecrets({ a: 1, pwd: 'x' }, ['pwd']), { a: 1 });
  } finally {
    process.env.AWX_CLIENT_SECRET = saved.secret;
    if (saved.key) process.env.TOKEN_ENCRYPTION_KEY = saved.key;
  }
  const sealed = sealSecrets({ pwd: 'x' }, ['pwd']);
  assert.deepEqual(revealSecrets(sealed), { pwd: 'x' });
});
