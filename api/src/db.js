const fs = require('fs');
const { Pool } = require('pg');

/**
 * PG_SSL=true : connexion chiffrée, certificat vérifié. PG_SSL_CA_FILE désigne
 * l'autorité interne qui signe le certificat du serveur PostgreSQL.
 * PG_SSL_REJECT_UNAUTHORIZED=false (sans vérification) est refusé en production.
 */
const sslOptions = () => {
  if (process.env.PG_SSL !== 'true') return false;
  const caFile = String(process.env.PG_SSL_CA_FILE || '').trim();
  return {
    rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false',
    ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}),
  };
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: sslOptions(),
});

pool.on('error', (err) => {
  console.error('[db] erreur de pool inattendue', err.message);
});

/**
 * Exécute une requête paramétrée. Le pool ne doit jamais être exposé
 * au navigateur : l'API est le seul client de PostgreSQL.
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<import('pg').QueryResult<any>>}
 */
async function q(text, params = []) {
  const started = Date.now();
  const res = await pool.query(text, params);
  if (process.env.SQL_DEBUG === 'true') {
    console.log(`[sql] ${text.replace(/\s+/g, ' ').slice(0, 120)} · ${Date.now() - started} ms`);
  }
  return res;
}

/**
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, q, withTransaction };