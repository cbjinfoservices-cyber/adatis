const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet').default;
const { rateLimit } = require('express-rate-limit');
const { q } = require('./db');
const { startProbing } = require('./healthMonitor');
const { startJobMonitor } = require('./jobMonitor');
const {
  attachSession, requireAuth, requireRole, authMode, purgeSessions,
} = require('./auth');
const audit = require('./audit');
const { configProblems, originGuard, noStore } = require('./security');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const requestRoutes = require('./routes/requests');
const requestJobRoutes = require('./routes/requestJobs');
const jobRoutes = require('./routes/jobs');
const dashboardRoutes = require('./routes/dashboard');
const approvalRoutes = require('./routes/approvals');
const connectorRoutes = require('./routes/connectors');
const adapterRoutes = require('./routes/adapters');
const tenantRoutes = require('./routes/tenants');
const systemRoutes = require('./routes/system');
const adminServicesRoutes = require('./routes/adminServices');

const app = express();
const PORT = Number(process.env.PORT || 8080);

const isProduction = process.env.NODE_ENV === 'production';

// CORS : en production, le portail et l'API partagent la même origine (Ingress),
// aucun en-tête CORS n'est donc nécessaire. ALLOWED_ORIGINS liste les origines
// tierces autorisées (cookies compris) ; « * » ouvre la lecture sans cookie.
const allowed = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Nombre de proxys de confiance devant l'API (Ingress) : req.ip est l'adresse
// qu'ils ont vue, jamais un X-Forwarded-For fourni par le client.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.disable('x-powered-by');

// HSTS en production seulement : en local, il bloquerait ensuite http://localhost.
app.use(helmet({ strictTransportSecurity: isProduction ? { maxAge: 31536000 } : false }));
if (allowed.includes('*')) {
  app.use(cors({ origin: true, credentials: false, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
} else if (allowed.length) {
  app.use(cors({ origin: allowed, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
}
app.use(compression());
app.use(express.json({ limit: '512kb' }));
app.use('/api', noStore);
app.use('/api', originGuard);
app.use('/api', audit.middleware);

// Limitation de débit par adresse IP (mémoire du pod).
const limit = (max, windowMs = 60 * 1000) => rateLimit({
  windowMs,
  limit: max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
app.use('/api/auth/login', limit(Number(process.env.RATE_LIMIT_LOGIN || 20)));
app.use('/api/auth/callback', limit(Number(process.env.RATE_LIMIT_LOGIN || 20)));
app.use('/api', limit(Number(process.env.RATE_LIMIT_API || 600)));

app.get('/health', async (_req, res) => {
  try {
    await q('SELECT 1');
    res.json({ status: 'ok', database: 'up', version: 1 });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'down', ...(isProduction ? {} : { message: err.message }) });
  }
});

// --- Authentification -------------------------------------------------------
// AUTH_MODE=awx : SSO Ascender obligatoire. Si la configuration est incomplète,
// authMode() vaut « misconfigured » et toute route protégée répond 503.
app.use('/api', attachSession);
app.use('/api/auth', authRoutes);
app.use('/api', (req, res, next) => {
  // Sonde publique : utilisée par le bandeau « API indisponible » et par
  // une supervision externe, elle doit répondre même sans session.
  if (req.path === '/system/health') return next();
  return requireAuth(req, res, next);
});

const ADMIN_WRITE_PREFIXES = ['/adapters', '/connectors', '/tenants', '/system/settings', '/auth/mappings', '/auth/users', '/admin/services'];
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
  // Statut d'une demande forcé à la main : réservé aux administrateurs.
  if (req.method === 'PATCH' && /^\/requests\/[^/]+$/.test(path)) {
    return requireRole('admin')(req, res, next);
  }
  return next();
});

app.use('/api', catalogRoutes);
app.use('/api', requestRoutes);
app.use('/api', requestJobRoutes);
app.use('/api', jobRoutes);
app.use('/api', dashboardRoutes);
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
  // Corps JSON illisible : erreur du client, pas du serveur.
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  console.error('[api]', err.message);
  // En production, le détail reste dans les journaux, jamais dans la réponse.
  return res.status(500).json({ error: 'internal_error', ...(isProduction ? {} : { message: err.message }) });
});

/** Démarre le serveur et les tâches de fond (sondes, purge des sessions). */
function start() {
  let stopProbing = () => {};
  let stopJobMonitor = () => {};

  // Production : configuration non sûre = l'API ne démarre pas.
  const problems = configProblems();
  if (problems.length) {
    console.error('[api] configuration refusée en production :');
    problems.forEach((problem) => console.error(`[api]   - ${problem}`));
    process.exit(1);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[api] ASP portal API à l'écoute sur :${PORT}`);
    const mode = authMode();
    if (mode === 'misconfigured') {
      console.error('[api] AUTH_MODE=awx mais la configuration Ascender est incomplète (AWX_BASE_URL, AWX_CLIENT_ID, AWX_CLIENT_SECRET) : portail fermé.');
    } else if (mode === 'disabled') {
      console.warn('[api] AUTH_MODE=disabled : portail ouvert sans authentification (développement uniquement).');
    }
    // Sonde interne toutes les 60 s : alimente l'historique 24 h même sans visiteur.
    stopProbing = startProbing();
    // Synchronisation de fond des jobs Ascender actifs (état et notification de fin).
    stopJobMonitor = startJobMonitor();
    // Purge horaire des sessions expirées au-delà du délai de grâce.
    setInterval(() => {
      purgeSessions().catch(() => {});
    }, 3600 * 1000).unref();
  });

  const shutdown = (signal) => {
    console.log(`[api] arrêt demandé (${signal})`);
    stopProbing();
    stopJobMonitor();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

// Importé par les tests : l'application est exportée sans écouter de port.
// scripts/dev-local.mjs démarre le serveur via app.start().
if (require.main === module) start();

module.exports = app;
module.exports.start = start;