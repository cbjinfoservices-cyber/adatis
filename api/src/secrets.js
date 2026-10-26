const crypto = require('crypto');

/**
 * Chiffrement des jetons Ascender stockés en base (AES-256-GCM).
 *
 * Clé : TOKEN_ENCRYPTION_KEY (32 octets en base64 ou hexadécimal). À défaut,
 * clé dérivée (HKDF) de AWX_CLIENT_SECRET, toujours présent quand le SSO est
 * actif. Format stocké : « v1:<iv>:<tag>:<chiffré> » en base64.
 * Une valeur sans préfixe v1: est un jeton historique en clair : relue telle quelle.
 */

const PREFIX = 'v1:';

const decodeKey = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  const buffer = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  return buffer.length === 32 ? buffer : null;
};

const currentKey = () => {
  const explicit = decodeKey(process.env.TOKEN_ENCRYPTION_KEY);
  if (explicit) return explicit;
  const secret = String(process.env.AWX_CLIENT_SECRET || '');
  if (!secret) return null;
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'asp-portal', 'token-encryption', 32));
};

const encrypt = (plain) => {
  const text = String(plain || '');
  const key = currentKey();
  if (!text || !key) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
};

/** Renvoie le jeton en clair, ou '' si la clé ne permet pas de le lire. */
const decrypt = (stored) => {
  const text = String(stored || '');
  if (!text.startsWith(PREFIX)) return text;
  const key = currentKey();
  if (!key) return '';
  try {
    const [iv, tag, data] = text.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
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

module.exports = {
  encrypt, decrypt, sealSecrets, revealSecrets,
};
