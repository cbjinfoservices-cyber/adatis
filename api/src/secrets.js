const crypto = require('crypto');

/**
 * Chiffrement des jetons Ascender et des champs secrets stockés en base
 * (AES-256-GCM).
 *
 * Trousseau :
 *   TOKEN_ENCRYPTION_KEY            clé courante (32 octets en base64 ou hexadécimal),
 *                                   utilisée pour tout nouveau chiffrement ;
 *   TOKEN_ENCRYPTION_KEYS_PREVIOUS  anciennes clés, séparées par des virgules,
 *                                   seulement pour relire (rotation).
 *
 * Format stocké : « v2:<kid>:<iv>:<tag>:<chiffré> », kid = empreinte de la clé.
 * Le format « v1:<iv>:<tag>:<chiffré> » (sans kid) reste lisible.
 *
 * En production, la clé courante est obligatoire (contrôle au démarrage) et
 * une valeur stockée en clair n'est jamais relue. Hors production seulement,
 * une clé est dérivée (HKDF) de AWX_CLIENT_SECRET à défaut de clé explicite.
 */

const V1 = 'v1:';
const V2 = 'v2:';

const isProduction = () => process.env.NODE_ENV === 'production';

const decodeKey = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  const buffer = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  return buffer.length === 32 ? buffer : null;
};

const keyId = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);

/** Ancienne clé de repli, dérivée du secret OAuth : lecture des valeurs v1 uniquement. */
const derivedKey = () => {
  const secret = String(process.env.AWX_CLIENT_SECRET || '');
  if (!secret) return null;
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'asp-portal', 'token-encryption', 32));
};

/** Clé courante : explicite, ou dérivée hors production. */
const currentKey = () => {
  const explicit = decodeKey(process.env.TOKEN_ENCRYPTION_KEY);
  if (explicit) return explicit;
  return isProduction() ? null : derivedKey();
};

const previousKeys = () => String(process.env.TOKEN_ENCRYPTION_KEYS_PREVIOUS || '')
  .split(',')
  .map(decodeKey)
  .filter(Boolean);

/** Toutes les clés capables de relire une valeur, la courante en premier. */
const readableKeys = () => {
  const keys = [currentKey(), ...previousKeys(), derivedKey()].filter(Boolean);
  const seen = new Set();
  return keys.filter((key) => {
    const id = keyId(key);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/** Vrai si TOKEN_ENCRYPTION_KEY est présente et fait 32 octets. */
const explicitKeyConfigured = () => Boolean(decodeKey(process.env.TOKEN_ENCRYPTION_KEY));

const encrypt = (plain) => {
  const text = String(plain || '');
  const key = currentKey();
  if (!text || !key) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${V2}${keyId(key)}:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
};

/** @param {Buffer} key @param {string[]} parts iv, tag et données, en base64 */
const openWith = (key, [iv, tag, data]) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

/** Renvoie la valeur en clair, ou '' si aucune clé du trousseau ne permet de la lire. */
const decrypt = (stored) => {
  const text = String(stored || '');
  if (!text) return '';
  if (text.startsWith(V2)) {
    const [kid, ...parts] = text.slice(V2.length).split(':');
    const key = readableKeys().find((candidate) => keyId(candidate) === kid);
    if (!key) return '';
    try { return openWith(key, parts); } catch { return ''; }
  }
  if (text.startsWith(V1)) {
    const parts = text.slice(V1.length).split(':');
    for (const key of readableKeys()) {
      try { return openWith(key, parts); } catch { /* clé suivante */ }
    }
    return '';
  }
  // Valeur historique en clair : jamais relue en production.
  return isProduction() ? '' : text;
};

/** Vrai si la valeur n'est pas chiffrée avec la clé courante (à re-chiffrer). */
const needsRotation = (stored) => {
  const text = String(stored || '');
  if (!text) return false;
  const key = currentKey();
  if (!key) return false;
  return !text.startsWith(`${V2}${keyId(key)}:`);
};

/* --- Champs secrets des formulaires (type « password ») ------------------ */

const SECRET_MARK = '$secret';

const isSealed = (value) => Boolean(value) && typeof value === 'object' && SECRET_MARK in value;

/**
 * Remplace les champs secrets par { $secret: <chiffré> } avant stockage.
 * Sans clé de chiffrement, la valeur n'est pas conservée.
 */
const sealSecrets = (values, names) => {
  const out = { ...values };
  const key = currentKey();
  (names || []).forEach((name) => {
    if (out[name] === undefined || out[name] === null || out[name] === '') return;
    if (key) out[name] = { [SECRET_MARK]: encrypt(out[name]) };
    else delete out[name];
  });
  return out;
};

/** Valeurs en clair, uniquement pour construire les extra_vars Ascender. */
const revealSecrets = (payload) => {
  if (!payload || typeof payload !== 'object') return payload || {};
  return Object.fromEntries(Object.entries(payload).map(([name, value]) => (
    [name, isSealed(value) ? decrypt(value[SECRET_MARK]) : value]
  )));
};

/** Re-chiffre avec la clé courante les champs secrets d'un payload. Renvoie null si rien ne change. */
const resealPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  let changed = false;
  const out = Object.fromEntries(Object.entries(payload).map(([name, value]) => {
    if (!isSealed(value) || !needsRotation(value[SECRET_MARK])) return [name, value];
    const plain = decrypt(value[SECRET_MARK]);
    if (!plain) return [name, value];
    changed = true;
    return [name, { [SECRET_MARK]: encrypt(plain) }];
  }));
  return changed ? out : null;
};

module.exports = {
  encrypt,
  decrypt,
  needsRotation,
  explicitKeyConfigured,
  sealSecrets,
  revealSecrets,
  resealPayload,
};
