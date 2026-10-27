const crypto = require('crypto');
const { q, withTransaction } = require('./db');

/**
 * Journal d'audit (table audit_log, migration 012).
 *
 * Chaque entrée est chaînée à la précédente par empreinte SHA-256 ; les
 * écritures sont sérialisées par un verrou consultatif pour que la chaîne
 * reste linéaire même avec plusieurs pods API. Chaque entrée est aussi écrite
 * en JSON sur la sortie standard (une ligne, "type":"audit") pour la collecte
 * par un SIEM ; AUDIT_STDOUT=false la désactive.
 */

const LOCK_KEY = 7240311;
const GENESIS = '0'.repeat(64);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Clés triées récursivement : jsonb ne conserve pas l'ordre d'insertion. */
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};

/** Champs couverts par l'empreinte, dans un ordre fixe. */
const digest = (prevHash, entry) => crypto.createHash('sha256').update(JSON.stringify([
  prevHash,
  entry.at,
  entry.actor_id,
  entry.actor_name,
  entry.actor_role,
  entry.ip,
  entry.method,
  entry.path,
  entry.action,
  entry.target,
  entry.status,
  canonical(entry.detail),
])).digest('hex');

const toStdout = () => String(process.env.AUDIT_STDOUT || 'true').toLowerCase() !== 'false';

/** Ajoute une entrée. Ne lève jamais : un échec est signalé dans les journaux. */
const record = async ({
  req, action, actor, target = '', status = 0, detail = {},
}) => {
  const user = actor || req?.auth?.user || {};
  const entry = {
    // Précision à la milliseconde, identique en mémoire et en base.
    at: new Date().toISOString(),
    actor_id: String(user.id || ''),
    actor_name: String(user.name || user.awxUsername || ''),
    actor_role: String(user.role || ''),
    ip: String(req?.ip || '').slice(0, 64),
    method: String(req?.method || ''),
    path: String(req?.originalUrl || '').split('?')[0].slice(0, 300),
    action: String(action).slice(0, 120),
    target: String(target || '').slice(0, 200),
    status: Number(status) || 0,
    detail: detail && typeof detail === 'object' ? detail : {},
  };

  if (toStdout()) console.log(JSON.stringify({ type: 'audit', ...entry }));

  try {
    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const last = await client.query('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
      const prevHash = last.rows[0]?.hash || GENESIS;
      await client.query(
        `INSERT INTO audit_log
           (at, actor_id, actor_name, actor_role, ip, method, path, action, target, status, detail, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          entry.at, entry.actor_id, entry.actor_name, entry.actor_role, entry.ip, entry.method,
          entry.path, entry.action, entry.target, entry.status, JSON.stringify(entry.detail),
          prevHash, digest(prevHash, entry),
        ],
      );
    });
  } catch (err) {
    console.error('[audit] écriture impossible :', err.message);
  }
};

/**
 * Middleware : trace chaque écriture sur l'API une fois la réponse envoyée,
 * y compris les refus (401, 403, 409…). Le corps n'est jamais copié, seuls
 * les noms de champs le sont.
 */
const middleware = (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();
  res.on('finish', () => {
    // Route nommée (/api/requests/:id) si la requête a été routée, sinon le chemin brut.
    const route = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : String(req.originalUrl || '').split('?')[0];
    const fields = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? Object.keys(req.body).slice(0, 50)
      : [];
    void record({
      req,
      action: `${req.method} ${route}`,
      target: req.params?.id || req.params?.userId || '',
      status: res.statusCode,
      detail: fields.length ? { fields } : {},
    });
  });
  return next();
};

const row = (r) => ({
  id: Number(r.id),
  at: new Date(r.at).toISOString(),
  actorId: r.actor_id,
  actorName: r.actor_name,
  actorRole: r.actor_role,
  ip: r.ip,
  method: r.method,
  path: r.path,
  action: r.action,
  target: r.target,
  status: r.status,
  detail: r.detail,
});

/** Dernières entrées, les plus récentes d'abord (pagination par `before`). */
const list = async ({ limit = 100, before } = {}) => {
  const params = [];
  let where = '';
  if (Number.isInteger(Number(before)) && Number(before) > 0) {
    params.push(Number(before));
    where = `WHERE id < $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 1000));
  const { rows } = await q(
    `SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(row);
};

/** Recalcule toute la chaîne. { ok, count, brokenAt } — brokenAt : premier id incohérent. */
const verify = async () => {
  const { rows } = await q('SELECT * FROM audit_log ORDER BY id');
  let prev = GENESIS;
  for (const r of rows) {
    const entry = {
      at: new Date(r.at).toISOString(),
      actor_id: r.actor_id,
      actor_name: r.actor_name,
      actor_role: r.actor_role,
      ip: r.ip,
      method: r.method,
      path: r.path,
      action: r.action,
      target: r.target,
      status: r.status,
      detail: r.detail,
    };
    if (r.prev_hash !== prev || digest(prev, entry) !== r.hash) {
      return { ok: false, count: rows.length, brokenAt: Number(r.id) };
    }
    prev = r.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
};

module.exports = {
  record, middleware, list, verify,
};
