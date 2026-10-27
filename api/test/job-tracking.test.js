const test = require('node:test');
const assert = require('node:assert/strict');
const { startStack } = require('../testing/helpers');
const { PAYLOADS } = require('../testing/payloads');

let stack;
let admin;
let alice;
let bob;
let carol;
let syncActiveJobs;

test.before(async () => {
  stack = await startStack();
  ({ syncActiveJobs } = require('../src/jobMonitor'));
  await stack.db.query(
    "INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')",
  );
  await stack.linkTenant('Infra');
  admin = await stack.login('admin');
  alice = await stack.login('alice');
  bob = await stack.login('bob');
  carol = await stack.login('carol');
  const res = await stack.call('PATCH', '/api/admin/services/create-dns-record', {
    cookie: admin, body: { kind: 'job', templateId: 9 },
  });
  assert.equal(res.status, 200);
});

test.afterEach(() => {
  stack.ascender.state.failLaunch = false;
  stack.ascender.setJobStatus('successful');
});

test.after(async () => {
  await stack.stop();
});

const orderDns = () => stack.call('POST', '/api/requests', {
  cookie: alice, body: { serviceId: 'create-dns-record', payload: PAYLOADS['create-dns-record'] },
});

const detail = async (id, cookie = alice) => (await stack.call('GET', `/api/requests/${id}`, { cookie })).body;

test('lancement refusé par Ascender : demande en échec, visible dans le suivi, relançable', async () => {
  stack.ascender.state.failLaunch = true;
  const created = await orderDns();
  assert.equal(created.status, 201);
  assert.ok(created.body.awxLaunch.error);

  const failed = await detail(created.body.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.launchError, /500/);
  assert.equal(failed.awx, null);
  assert.equal(failed.timeline.find((s) => s.key === 'launch').status, 'failed');
  assert.deepEqual(failed.attempts.map((a) => a.status), ['launch_failed']);

  const jobs = await stack.call('GET', '/api/jobs', { cookie: alice });
  const row = jobs.body.items.find((i) => i.id === created.body.id);
  assert.equal(row.portalStatus, 'failed');
  assert.equal(row.awxStatus, 'launch_failed');

  stack.ascender.state.failLaunch = false;
  const relaunch = await stack.call('POST', `/api/requests/${created.body.id}/awx/launch`, { cookie: alice });
  assert.equal(relaunch.status, 200);
  assert.ok(relaunch.body.awx.jobId > 0);
  assert.equal(relaunch.body.status, 'queued');
  assert.equal(relaunch.body.launchError, '');
  assert.deepEqual(relaunch.body.attempts.map((a) => a.attempt), [2, 1]);
});

test('synchronisation de fond : état, progression et fin du job sans visiteur', async () => {
  stack.ascender.setJobStatus('running');
  const created = await orderDns();
  const jobId = created.body.awxLaunch.jobId;

  await syncActiveJobs();
  const running = await detail(created.body.id);
  assert.equal(running.status, 'running');
  assert.ok(running.progress >= 5 && running.progress <= 95, String(running.progress));
  assert.ok(running.awx.syncedAt);

  // L'affichage ne relit pas Ascender : l'état change à la tournée suivante.
  stack.ascender.setJobStatus('successful', jobId);
  assert.equal((await detail(created.body.id)).status, 'running');

  await syncActiveJobs();
  const done = await detail(created.body.id);
  assert.equal(done.status, 'success');
  assert.equal(done.progress, 100);
  assert.ok(done.awx.finishedAt);
  assert.equal(done.attempts[0].status, 'successful');
  const notified = await stack.db.query('SELECT awx_notified_at FROM requests WHERE id = $1', [created.body.id]);
  assert.ok(notified.rows[0].awx_notified_at, 'fin de job réservée pour la notification');

  // Job réussi : jamais relancé.
  const again = await stack.call('POST', `/api/requests/${created.body.id}/awx/launch`, { cookie: alice });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'awx_job_exists');
});

test('rafraîchissement par un approbateur : jeton du lanceur, pas le sien', async () => {
  stack.ascender.setJobStatus('running');
  const created = await orderDns();
  const synced = await stack.call('POST', `/api/requests/${created.body.id}/awx/sync`, { cookie: bob });
  assert.equal(synced.status, 200, JSON.stringify(synced.body));
  assert.equal(synced.body.status, 'running');
});

test('annulation : job en cours annulé, puis relancé', async () => {
  stack.ascender.setJobStatus('running');
  const created = await orderDns();
  const id = created.body.id;

  const active = await stack.call('POST', `/api/requests/${id}/awx/launch`, { cookie: alice });
  assert.equal(active.status, 409);
  assert.equal(active.body.error, 'awx_job_active');

  const other = await stack.call('POST', `/api/requests/${id}/awx/cancel`, { cookie: carol });
  assert.equal(other.status, 404);

  const canceled = await stack.call('POST', `/api/requests/${id}/awx/cancel`, { cookie: alice });
  assert.equal(canceled.status, 200, JSON.stringify(canceled.body));
  assert.equal(canceled.body.status, 'canceled');
  assert.equal(stack.ascender.state.cancels.at(-1).user, 'alice');

  const twice = await stack.call('POST', `/api/requests/${id}/awx/cancel`, { cookie: alice });
  assert.equal(twice.status, 409);

  stack.ascender.setJobStatus('successful');
  const relaunch = await stack.call('POST', `/api/requests/${id}/awx/launch`, { cookie: alice });
  assert.equal(relaunch.status, 200);
  assert.notEqual(relaunch.body.awx.jobId, created.body.awxLaunch.jobId);
  assert.deepEqual(relaunch.body.attempts.map((a) => a.status), ['pending', 'canceled']);
});

test('sortie du job : job courant, tentative précédente, job étranger refusé', async () => {
  stack.ascender.setJobStatus('running');
  const created = await orderDns();
  const id = created.body.id;
  const first = created.body.awxLaunch.jobId;

  const output = await stack.call('GET', `/api/requests/${id}/awx/output`, { cookie: alice });
  assert.equal(output.status, 200);
  assert.match(output.body.text, /PLAY \[Créer entrée DNS\]/);
  assert.equal(output.body.truncated, false);

  await stack.call('POST', `/api/requests/${id}/awx/cancel`, { cookie: alice });
  await stack.call('POST', `/api/requests/${id}/awx/launch`, { cookie: alice });
  const previous = await stack.call('GET', `/api/requests/${id}/awx/output?jobId=${first}`, { cookie: alice });
  assert.equal(previous.status, 200);
  assert.equal(previous.body.jobId, first);

  const foreign = await stack.call('GET', `/api/requests/${id}/awx/output?jobId=1`, { cookie: alice });
  assert.equal(foreign.status, 404);

  // Lecture avec les droits Ascender du lecteur : l'approbateur n'y a pas accès.
  const approver = await stack.call('GET', `/api/requests/${id}/awx/output`, { cookie: bob });
  assert.equal(approver.status, 403);
  assert.equal(approver.body.error, 'awx_output_forbidden');
});
