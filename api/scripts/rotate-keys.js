#!/usr/bin/env node
/**
 * Rotation de la clé de chiffrement : re-chiffre avec TOKEN_ENCRYPTION_KEY
 * tout ce qui est encore chiffré avec une ancienne clé.
 *
 *   TOKEN_ENCRYPTION_KEY=<nouvelle> TOKEN_ENCRYPTION_KEYS_PREVIOUS=<ancienne> \
 *     node scripts/rotate-keys.js
 *
 * Procédure : déployer la nouvelle clé en courante et l'ancienne dans
 * TOKEN_ENCRYPTION_KEYS_PREVIOUS, lancer ce script (dans le pod API), puis
 * retirer l'ancienne clé. Idempotent : peut être relancé sans risque.
 */
const { q, pool } = require('../src/db');
const {
  encrypt, decrypt, needsRotation, explicitKeyConfigured, resealPayload,
} = require('../src/secrets');

async function rotateSessions() {
  const { rows } = await q('SELECT id, access_token, refresh_token FROM auth_sessions');
  let updated = 0;
  let unreadable = 0;
  for (const row of rows) {
    if (!needsRotation(row.access_token) && !needsRotation(row.refresh_token)) continue;
    const access = decrypt(row.access_token);
    const refresh = decrypt(row.refresh_token);
    if ((row.access_token && !access) || (row.refresh_token && !refresh)) {
      // Illisible avec le trousseau : session inutilisable, supprimée.
      // eslint-disable-next-line no-await-in-loop
      await q('DELETE FROM auth_sessions WHERE id = $1', [row.id]);
      unreadable += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await q(
      'UPDATE auth_sessions SET access_token = $2, refresh_token = $3 WHERE id = $1',
      [row.id, encrypt(access), encrypt(refresh)],
    );
    updated += 1;
  }
  return { updated, unreadable };
}

async function rotateRequests() {
  const { rows } = await q("SELECT id, payload FROM requests WHERE payload::text LIKE '%$secret%'");
  let updated = 0;
  for (const row of rows) {
    const next = resealPayload(row.payload);
    if (!next) continue;
    // eslint-disable-next-line no-await-in-loop
    await q('UPDATE requests SET payload = $2 WHERE id = $1', [row.id, JSON.stringify(next)]);
    updated += 1;
  }
  return { updated };
}

async function main() {
  if (!explicitKeyConfigured()) {
    console.error('[rotate] TOKEN_ENCRYPTION_KEY absente ou invalide (32 octets en base64 ou hexadécimal).');
    process.exit(1);
  }
  const sessions = await rotateSessions();
  const requests = await rotateRequests();
  console.log(`[rotate] sessions re-chiffrées : ${sessions.updated}, supprimées (illisibles) : ${sessions.unreadable}`);
  console.log(`[rotate] demandes re-chiffrées : ${requests.updated}`);
}

main()
  .catch((err) => { console.error('[rotate]', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
