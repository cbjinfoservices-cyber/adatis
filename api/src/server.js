const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { q } = require('./db');
const { startProbing } = require('./healthMonitor');
const {
  attachSession, requireAuth, requireRole, authMode,
} = require('./auth');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const requestRoutes = require('./routes/requests');
const approvalRoutes = require('./routes/approvals');
const connectorRoutes = require('./routes/connectors');
const adapterRoutes = require('./routes/adapters');
const tenantRoutes = require('./routes/tenants');
const systemRoutes = require('./routes/system');
const adminServicesRoutes = require('./routes/adminServices');

const app = express();
const PORT = Number(process.env.PORT || 8080);

// CORS : restreindre aux origines du portail (séparées par des virgules).
// Par défaut, toutes les origines sont acceptées pour faciliter le premier déploiement.
const allowed = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);

app.use(cors({
  origin: allowed.includes('*') ? true : allowed,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '512kb' }));

app.get('/health', async (_req, res) => {
  try {
    await q('SELECT 1');
    res.json({ status: 'ok', database: 'up', version: 1 });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'down', message: err.message });
  }
});

// --- Authentification -------------------------------------------------------
// AUTH_MODE=awx : SSO AWX obligatoire. Tant que la configuration AWX est
// incomplète, authMode() reste « disabled » pour ne jamais verrouiller le portail.
app.use('/api', attachSession);
app.use('/api/auth', authRoutes);
app.use('/api', (req, res, next) => {
  // Sonde publique : utilisée par le bandeau « API indisponible » et par
  // une supervision externe, elle doit répondre même sans session.
  if (req.path === '/system/health') return next();
  return requireAuth(req, res, next);
});

const ADMIN_WRITE_PREFIXES = ['/adapters', '/connectors', '/tenants', '/system/settings', '/auth/mappings', '/admin/services'];
app.use('/api', (req, res, next) => {
  if (authMode() === 'disabled') return next();
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const path = req.path;
  if (ADMIN_WRITE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return requireRole('admin')(req, res, next);
  }
  if (/^\/approvals\/[^/]+\/decision$/.test(path)) {
    return requireRole('admin', 'approver')(req, res, next);
  }
  return next();
});

app.use('/api', catalogRoutes);
app.use('/api', requestRoutes);
app.use('/api', approvalRoutes);
app.use('/api', connectorRoutes);
app.use('/api', adapterRoutes);
app.use('/api', tenantRoutes);
app.use('/api', systemRoutes);
app.use('/api', adminServicesRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

let stopProbing = () => {};

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] ASP portal API à l'écoute sur :${PORT}`);
  // Sonde interne toutes les 60 s : alimente l'historique 24 h même sans visiteur.
  stopProbing = startProbing();
  // Purge des sessions expirées (toutes les heures, sans bloquer l'arrêt).
  setInterval(() => {
    q('DELETE FROM auth_sessions WHERE expires_at < now()').catch(() => {});
  }, 3600 * 1000).unref();
});

function shutdown(signal) {
  console.log(`[api] arrêt demandé (${signal})`);
  stopProbing();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;