/**
 * Pile de test : PostgreSQL réel (PGlite, en mémoire) avec toutes les
 * migrations de db/, catalogue de test, faux Ascender, et l'API Express sur un port libre.
 * Un fichier de test = un processus = une pile (node --test isole les fichiers).
 */
const fs = require('fs');
const path = require('path');
const net = require('net');

const DB_DIR = path.join(__dirname, '..', '..', 'db');

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
  srv.on('error', reject);
});

async function startDatabase() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  const db = await PGlite.create();
  const files = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await db.exec(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
  }
  await db.exec(fs.readFileSync(path.join(__dirname, 'catalog.sql'), 'utf8'));
  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  return { db, port, stop: async () => { await server.stop(); await db.close(); } };
}

/**
 * Démarre la pile. `env` complète les variables d'environnement de l'API
 * (AUTH_MODE, etc.) ; AWX_BASE_URL pointe par défaut sur le faux Ascender.
 */
async function startStack(env = {}) {
  const { startMockAscender } = require('./mockAscender');
  const database = await startDatabase();
  const ascender = await startMockAscender();

  Object.assign(process.env, {
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${database.port}/postgres`,
    PG_POOL_MAX: '1',
    NODE_ENV: 'test',
    AUTH_MODE: 'awx',
    AWX_BASE_URL: ascender.url,
    AWX_CLIENT_ID: 'portal',
    AWX_CLIENT_SECRET: 'secret',
    PORTAL_URL: 'http://portal.test',
    AWX_REDIRECT_URI: 'http://portal.test/api/auth/callback',
    AUDIT_STDOUT: 'false',
    ...env,
  });

  const app = require('../src/server');
  const { pool } = require('../src/db');
  const http = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const base = `http://127.0.0.1:${http.address().port}`;

  /** Appel JSON, avec le cookie de session éventuel. */
  const call = async (method, url, { cookie, body } = {}) => {
    const response = await fetch(`${base}${url}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: response.status, body: json, headers: response.headers };
  };

  /** Parcours SSO complet (login -> Ascender -> callback) : renvoie le cookie. */
  const login = async (username) => {
    ascender.setUser(username);
    const start = await fetch(`${base}/api/auth/login`, { redirect: 'manual' });
    const stateCookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const authorize = await fetch(start.headers.get('location'), { redirect: 'manual' });
    const callback = new URL(authorize.headers.get('location'));
    const done = await fetch(`${base}${callback.pathname}${callback.search}`, {
      redirect: 'manual', headers: { Cookie: stateCookie },
    });
    const session = done.headers.getSetCookie().find((c) => c.startsWith('asp_session=') && !c.startsWith('asp_session=;'));
    if (!session) throw new Error(`login ${username} : pas de cookie de session (${done.headers.get('location')})`);
    return session.split(';')[0];
  };

  const stop = async () => {
    await new Promise((resolve) => { http.closeAllConnections?.(); http.close(resolve); });
    await pool.end().catch(() => {});
    await ascender.close();
    await database.stop();
  };

  /**
   * Rattache l'organisation Ascender `org` à un tenant : ses membres le
   * reçoivent à leur prochaine connexion. Un approbateur ne décide que dans
   * son tenant ; sans tenant, il ne voit que ses propres demandes.
   */
  const linkTenant = async (org = 'Infra') => {
    const id = org.toLowerCase();
    await database.db.query(
      `INSERT INTO tenants (id, name, platform_name, awx_organization) VALUES ($1, $2, 'Service Portal', $2)
       ON CONFLICT (id) DO UPDATE SET awx_organization = EXCLUDED.awx_organization`,
      [id, org],
    );
    return id;
  };

  return {
    base, call, login, linkTenant, ascender, db: database.db, stop,
  };
}

module.exports = { startStack };
