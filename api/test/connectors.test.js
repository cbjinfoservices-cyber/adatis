const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startStack } = require('../testing/helpers');

let stack;
let admin;
let target;
let base;

test.before(async () => {
  stack = await startStack();
  await stack.db.query(
    "INSERT INTO connectors (id, kind, name, endpoint, endpoint_default, configured) VALUES ('cn-jen-02', 'jenkins', 'Jenkins Build Service', '—', '—', true)",
  );
  admin = await stack.login('admin');
  // Faux Jenkins : /ok -> 200, /auth -> 401, /fail -> 503.
  target = http.createServer((req, res) => {
    const status = { '/ok': 200, '/auth': 401, '/fail': 503 }[req.url] || 404;
    res.writeHead(status);
    res.end();
  });
  await new Promise((resolve) => { target.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${target.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => { target.close(resolve); });
  await stack.stop();
});

const setEndpoint = (endpoint) => stack.call('PATCH', '/api/connectors/cn-jen-02', { cookie: admin, body: { endpoint } });
const runTest = (body) => stack.call('POST', '/api/connectors/cn-jen-02/test', { cookie: admin, body });

test('test réel : URL joignable, résultat envoyé par le client ignoré', async () => {
  await setEndpoint(`${base}/ok`);
  const res = await runTest({ ok: false, latency: 9999, error: 'faux' });
  assert.equal(res.status, 200);
  assert.equal(res.body.health, 'healthy');
  assert.equal(res.body.tests[0].ok, true);
  assert.ok(res.body.tests[0].latency < 9999);
  assert.equal(res.body.retestRequiredAt, null);
});

test('401 = service joignable ; 503 = dégradé ; port fermé = en panne', async () => {
  await setEndpoint(`${base}/auth`);
  assert.equal((await runTest()).body.health, 'healthy');

  await setEndpoint(`${base}/fail`);
  const degraded = await runTest();
  assert.equal(degraded.body.health, 'degraded');
  assert.equal(degraded.body.tests[0].error, 'HTTP 503');

  await setEndpoint('http://127.0.0.1:1/');
  const down = await runTest();
  assert.equal(down.body.health, 'down');
  assert.match(down.body.tests[0].error, /^Injoignable/);
});

test('test groupé : mêmes tests réels, sans valeur aléatoire', async () => {
  await setEndpoint(`${base}/ok`);
  const batch = await stack.call('POST', '/api/connectors/batch-test', { cookie: admin });
  assert.equal(batch.status, 200);
  assert.ok(batch.body.total >= 1);
  const jenkins = await stack.call('GET', '/api/connectors/cn-jen-02', { cookie: admin });
  assert.equal(jenkins.body.health, 'healthy');
  assert.equal(jenkins.body.managed, false);
});

test('un demandeur ne peut pas déclencher de test', async () => {
  const alice = await stack.login('alice');
  const res = await stack.call('POST', '/api/connectors/cn-jen-02/test', { cookie: alice });
  assert.equal(res.status, 403);
});
