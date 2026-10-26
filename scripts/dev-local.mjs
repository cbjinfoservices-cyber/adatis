#!/usr/bin/env node
/**
 * Portail ASP en local, sans Docker ni PostgreSQL installé.
 *
 *   npm run dev:local                 # portail ouvert (AUTH_MODE=disabled)
 *   npm run dev:local -- --mock-sso   # SSO via un faux Ascender (utilisateur admin)
 *   npm run dev:local -- --reset      # repart d'une base vide
 *
 * Un seul processus : PostgreSQL (PGlite, données dans .pgdata/), migrations
 * de db/, API sur :8080, faux Ascender éventuel, puis Vite sur :3000 (proxy /api).
 * Prérequis : npm ci à la racine et dans api/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const DATA_DIR = path.join(ROOT, '.pgdata');
const DB_PORT = Number(process.env.DEV_DB_PORT || 5432);
const API_PORT = Number(process.env.PORT || 8080);
const MOCK_PORT = Number(process.env.DEV_MOCK_PORT || 8052);

// PGlite et l'API vivent dans api/node_modules.
const apiRequire = createRequire(path.join(ROOT, 'api', 'package.json'));
const importFromApi = (name) => import(pathToFileURL(apiRequire.resolve(name)).href);
const { PGlite } = await importFromApi('@electric-sql/pglite');
const { PGLiteSocketServer } = await importFromApi('@electric-sql/pglite-socket');

const log = (message) => console.log(`[dev-local] ${message}`);

if (args.has('--reset')) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  log('base réinitialisée');
}

// --- PostgreSQL + migrations (même logique que db/migrate.sh) ---------------
const db = await PGlite.create(DATA_DIR);
await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
const sqlDir = path.join(ROOT, 'db');
for (const file of fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort()) {
  const done = await db.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
  if (done.rows.length) continue;
  await db.exec(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
  await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
  log(`migration ${file} appliquée`);
}
const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1' });
await dbServer.start();
log(`PostgreSQL (PGlite) sur 127.0.0.1:${DB_PORT}`);

// --- Faux Ascender (optionnel) ---------------------------------------------
let mock = null;
if (args.has('--mock-sso')) {
  const { startMockAscender } = apiRequire('./testing/mockAscender.js');
  mock = await startMockAscender(MOCK_PORT);
  mock.setUser(process.env.DEV_USER || 'admin');
  log(`faux Ascender sur ${mock.url} (connexion en tant que ${process.env.DEV_USER || 'admin'})`);
}

// --- API -------------------------------------------------------------------
Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
  PG_POOL_MAX: '1',
  PORT: String(API_PORT),
  PORTAL_URL: 'http://localhost:3000',
  ...(mock ? {
    AUTH_MODE: 'awx',
    AWX_BASE_URL: mock.url,
    AWX_CLIENT_ID: 'dev-portal',
    AWX_CLIENT_SECRET: 'dev-secret',
    AWX_REDIRECT_URI: 'http://localhost:3000/api/auth/callback',
  } : { AUTH_MODE: process.env.AUTH_MODE || 'disabled' }),
});
const app = apiRequire('./src/server.js');
const apiServer = app.start();

// --- Front (Vite) ------------------------------------------------------------
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--port', '3000', '--strictPort'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_PROXY: `http://127.0.0.1:${API_PORT}` },
});
log('portail sur http://localhost:3000');

const stop = async () => {
  vite.kill();
  apiServer.close();
  if (mock) await mock.close();
  await dbServer.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', stop);
