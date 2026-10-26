/**
 * Faux Ascender pour les tests : OAuth2 (authorize/token), /api/v2/me/,
 * organisations et équipes, templates filtrés par utilisateur (RBAC),
 * lancement et suivi des jobs. Les formes de réponse suivent l'API AWX.
 */
const http = require('http');

const USERS = {
  admin: { id: 1, username: 'admin', email: 'admin@acme.fr', first_name: 'Ada', last_name: 'Admin', is_superuser: true, orgs: ['Infra'], teams: [] },
  alice: { id: 2, username: 'alice', email: 'alice@acme.fr', first_name: 'Alice', last_name: 'Martin', is_superuser: false, orgs: ['Infra'], teams: [] },
  bob: { id: 3, username: 'bob', email: 'bob@acme.fr', first_name: 'Bob', last_name: 'Durand', is_superuser: false, orgs: ['Infra'], teams: [['Approvers', 'Infra']] },
  carol: { id: 4, username: 'carol', email: 'carol@acme.fr', first_name: 'Carol', last_name: 'Petit', is_superuser: false, orgs: ['Infra'], teams: [] },
};

// Template 9 (DNS) visible par tous, 7 (VM) et workflow 20 réservés à admin.
const TEMPLATES = [
  { id: 7, name: 'Créer VM Linux', users: ['admin'] },
  { id: 9, name: 'Créer entrée DNS', users: ['admin', 'alice', 'bob', 'carol'] },
];
const WORKFLOWS = [{ id: 20, name: 'Provisionner une application', users: ['admin'] }];

const tokenFor = (username) => `tok-${username}`;

function startMockAscender(port = 0) {
  const state = { nextUser: 'admin', down: false, jobs: new Map(), nextJob: 100, launches: [] };

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    if (state.down) {
      req.socket.destroy();
      return undefined;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/api/v2/ping/') return send(res, 200, { version: '24.6.1', active_node: 'ascender-0' });

    if (path === '/o/authorize/') {
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.searchParams.set('code', `code-${state.nextUser}`);
      back.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }

    if (path === '/o/token/' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const form = new URLSearchParams(body);
        const username = form.get('grant_type') === 'refresh_token'
          ? String(form.get('refresh_token')).replace('refresh-', '')
          : String(form.get('code')).replace('code-', '');
        send(res, 200, {
          access_token: tokenFor(username), refresh_token: `refresh-${username}`,
          token_type: 'Bearer', expires_in: 36000, scope: 'read write',
        });
      });
      return undefined;
    }

    const auth = String(req.headers.authorization || '');
    const user = Object.values(USERS).find((u) => auth === `Bearer ${tokenFor(u.username)}`);
    if (!user) return send(res, 401, { detail: 'Authentication credentials were not provided.' });

    if (path === '/api/v2/me/') {
      const { orgs, teams, ...me } = user;
      return send(res, 200, { count: 1, next: null, results: [me] });
    }
    if (path === `/api/v2/users/${user.id}/organizations/`) {
      return send(res, 200, { count: user.orgs.length, results: user.orgs.map((name, i) => ({ id: i + 1, name })) });
    }
    if (path === `/api/v2/users/${user.id}/teams/`) {
      return send(res, 200, {
        count: user.teams.length,
        results: user.teams.map(([name, org], i) => ({ id: i + 1, name, summary_fields: { organization: { name: org } } })),
      });
    }

    const visible = (list) => list.filter((t) => t.users.includes(user.username)).map((t) => ({
      id: t.id, name: t.name, description: '',
      summary_fields: { organization: { name: 'Infra' }, user_capabilities: { start: true } },
    }));
    if (path === '/api/v2/job_templates/') return send(res, 200, { count: 0, next: null, results: visible(TEMPLATES) });
    if (path === '/api/v2/workflow_job_templates/') return send(res, 200, { count: 0, next: null, results: visible(WORKFLOWS) });

    const launch = path.match(/^\/api\/v2\/(job_templates|workflow_job_templates)\/(\d+)\/launch\/$/);
    if (launch && req.method === 'POST') {
      const list = launch[1] === 'job_templates' ? TEMPLATES : WORKFLOWS;
      const tpl = list.find((t) => t.id === Number(launch[2]));
      if (!tpl || !tpl.users.includes(user.username)) return send(res, 403, { detail: 'You do not have permission.' });
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const id = state.nextJob;
        state.nextJob += 1;
        state.jobs.set(id, { template: tpl, created: Date.now(), user: user.username });
        state.launches.push({ id, template: tpl.id, user: user.username, body: JSON.parse(body || '{}') });
        send(res, 201, launch[1] === 'job_templates' ? { job: id, id, status: 'pending' } : { workflow_job: id, id, status: 'pending' });
      });
      return undefined;
    }

    const job = path.match(/^\/api\/v2\/(jobs|workflow_jobs)\/(\d+)\/$/);
    if (job && state.jobs.has(Number(job[2]))) {
      const j = state.jobs.get(Number(job[2]));
      return send(res, 200, {
        id: Number(job[2]), status: 'successful', failed: false, elapsed: 3,
        started: new Date(j.created).toISOString(), finished: new Date(j.created + 3000).toISOString(),
        summary_fields: { job_template: { id: j.template.id, name: j.template.name } },
      });
    }

    return send(res, 404, { detail: 'Not found.' });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        state,
        setUser: (username) => { state.nextUser = username; },
        setDown: (down) => { state.down = down; },
        close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }),
      });
    });
  });
}

module.exports = { startMockAscender, USERS };
