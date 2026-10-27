#!/usr/bin/env node
/**
 * Parcours du portail dans un vrai navigateur (Chromium, Playwright).
 *
 *   npm run build && npm run test:e2e
 *
 * Démarre une pile isolée : PostgreSQL en mémoire (PGlite + migrations),
 * faux Ascender, API, et le build de production (out/) servi avec la CSP de
 * deploy/nginx.conf. Se connecte en admin puis en demandeur, ouvre chaque
 * page et échoue sur : erreur JavaScript, violation CSP, requête en échec,
 * réponse 5xx ou clé de traduction affichée telle quelle.
 * Captures d'écran : e2e-output/.
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const SHOTS = path.join(ROOT, 'e2e-output');
const apiRequire = createRequire(path.join(ROOT, 'api', 'package.json'));
const importFromApi = (name) => import(pathToFileURL(apiRequire.resolve(name)).href);

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('[e2e] out/ absent : lancer npm run build');
  process.exit(1);
}
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
});

// --- Base, faux Ascender, API ----------------------------------------------
const { PGlite } = await importFromApi('@electric-sql/pglite');
const { PGLiteSocketServer } = await importFromApi('@electric-sql/pglite-socket');
const db = await PGlite.create();
for (const file of fs.readdirSync(path.join(ROOT, 'db')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(path.join(ROOT, 'db', file), 'utf8'));
}
await db.exec(fs.readFileSync(path.join(ROOT, 'api', 'testing', 'catalog.sql'), 'utf8'));
await db.exec("INSERT INTO awx_role_mappings (awx_org, awx_team, role) VALUES ('Infra', 'Approvers', 'approver')");
// Noms de tables (affichés par la page Système) : ce ne sont pas des clés de traduction.
const TABLES = new Set((await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map((r) => r.tablename));
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db, port: dbPort, host: '127.0.0.1' });
await dbServer.start();

const { startMockAscender } = apiRequire('./testing/mockAscender.js');
const mock = await startMockAscender();

const webPort = await freePort();
const apiPort = await freePort();
const BASE = `http://127.0.0.1:${webPort}`;
Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${dbPort}/postgres`,
  PG_POOL_MAX: '1',
  PORT: String(apiPort),
  AUTH_MODE: 'awx',
  AWX_BASE_URL: mock.url,
  AWX_CLIENT_ID: 'e2e',
  AWX_CLIENT_SECRET: 'e2e-secret',
  PORTAL_URL: BASE,
  AWX_REDIRECT_URI: `${BASE}/api/auth/callback`,
  RATE_LIMIT_API: '100000',
  AUDIT_STDOUT: 'false',
});
const app = apiRequire('./src/server.js');
const apiServer = await new Promise((resolve) => { const s = app.listen(apiPort, '127.0.0.1', () => resolve(s)); });

// --- Front de production avec la CSP de nginx.conf --------------------------
const nginx = fs.readFileSync(path.join(ROOT, 'deploy', 'nginx.conf'), 'utf8');
const CSP = nginx.match(/set \$csp "([^"]+)";/)[1];
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json', '.map': 'application/json',
};
const web = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = http.request({
      host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers,
    }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(upstream);
    return;
  }
  const clean = decodeURIComponent(new URL(req.url, BASE).pathname);
  let file = path.join(OUT, clean);
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(OUT, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Content-Security-Policy': CSP,
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => { web.listen(webPort, '127.0.0.1', resolve); });

// --- Navigateur ----------------------------------------------------------------
const browser = await chromium.launch();
const problems = [];
// Segments d'URL (ex. /api/v2/workflow_job_templates/) exclus : ce ne sont pas des clés.
const KEY_LIKE = /(?<!\/)\b[a-z]+(?:_[a-z0-9]+){2,}\b/g;

async function session(username, lang = 'fr') {
  mock.setUser(username);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((lng) => { try { localStorage.setItem('i18nextLng', lng); } catch { /* */ } }, lang);
  const page = await context.newPage();
  const where = () => `${username}/${lang} ${new URL(page.url()).pathname}`;
  page.on('pageerror', (err) => problems.push(`${where()} : erreur JS : ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 401/403/404 attendus selon le rôle : seuls les autres messages comptent.
    if (/status of 40[134]/.test(text)) return;
    problems.push(`${where()} : console : ${text.slice(0, 300)}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    if (failure.includes('ERR_ABORTED')) return;
    problems.push(`${where()} : requête en échec ${request.url()} (${failure})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) problems.push(`${where()} : HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(`${BASE}/api/auth/login`);
  await page.waitForURL(`${BASE}/**`);
  return { context, page };
}

async function visit(page, route, name) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const text = await page.locator('body').innerText();
  const keys = [...new Set((text.match(KEY_LIKE) || []))].filter((k) => !TABLES.has(k));
  if (keys.length) problems.push(`${name} ${route} : clés de traduction affichées : ${keys.slice(0, 8).join(', ')}`);
  await page.screenshot({ path: path.join(SHOTS, `${name}-${route.replace(/[^a-z0-9]+/gi, '_') || 'home'}.png`), fullPage: true });
  console.log(`[e2e] ${name.padEnd(10)} ${route}`);
}

const ROUTES = [
  '/', '/services/create-dns-record', '/requests', '/awx', '/dashboard', '/approvals', '/notifications',
  '/admin/connectors', '/admin/adapters', '/admin/services', '/admin/branding', '/admin/system', '/admin/auth',
];

try {
  // Administrateur : toutes les pages, en français puis en arabe (RTL).
  const admin = await session('admin');
  await admin.context.request.patch(`${BASE}/api/admin/services/create-dns-record`, { data: { kind: 'job', templateId: 9 } });
  for (const route of ROUTES) await visit(admin.page, route, 'admin');

  const arabic = await session('admin', 'ar');
  await visit(arabic.page, '/', 'admin-ar');
  const dir = await arabic.page.evaluate(() => document.documentElement.dir);
  if (dir !== 'rtl') problems.push(`arabe : dir="${dir}" au lieu de rtl`);
  await visit(arabic.page, '/admin/connectors', 'admin-ar');

  // Demandeur : commande, fiche de demande, pages autorisées.
  const alice = await session('alice');
  const created = await alice.context.request.post(`${BASE}/api/requests`, {
    data: {
      serviceId: 'create-dns-record',
      payload: { zone: 'acme.fr', record_type: 'A', fqdn: 'e2e.acme.fr', value: '10.0.0.5' },
    },
  });
  if (created.status() !== 201) problems.push(`commande alice : HTTP ${created.status()}`);
  const request = await created.json();
  for (const route of ['/', '/requests', `/requests/${request.id}`, '/awx', '/notifications']) await visit(alice.page, route, 'alice');
  if (/Santé des connecteurs/i.test(await alice.page.locator('body').innerText())) {
    problems.push('alice voit la santé des connecteurs dans la barre latérale');
  }
  // Un demandeur ne doit pas voir l'administration.
  await visit(alice.page, '/admin/connectors', 'alice');
  const adminText = await alice.page.locator('body').innerText();
  if (/Exécution non branchée|cn-jen-02/.test(adminText)) problems.push('alice voit la page Connecteurs');
} finally {
  await browser.close();
  web.close();
  apiServer.close();
  await mock.close();
  await dbServer.stop();
  await db.close();
}

if (problems.length) {
  console.error(`\n[e2e] ${problems.length} problème(s) :`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log(`\n[e2e] aucun problème · captures dans ${path.relative(ROOT, SHOTS)}/`);
process.exit(0);
