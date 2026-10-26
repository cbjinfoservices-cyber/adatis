/**
 * Validation serveur des formulaires de commande (form_schemas.fields).
 *
 * Reprend les règles du moteur de formulaires du navigateur
 * (src/utils/validation.ts) et ajoute ce que le navigateur ne peut garantir :
 * types réels, valeurs limitées aux options proposées, champs inconnus retirés.
 * Les valeurs validées sont transmises à Ascender (extra_vars).
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;
const FQDN = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_TEXT = 20000;
const MAX_ITEMS = 200;

const isIp = (v) => IPV4.test(v) || (v.includes(':') && IPV6.test(v));

const isCidr = (v) => {
  const [ip, mask] = v.split('/');
  if (!ip || mask === undefined || !/^\d+$/.test(mask)) return false;
  const m = Number(mask);
  if (IPV4.test(ip)) return m >= 0 && m <= 32;
  return isIp(ip) && m >= 0 && m <= 128;
};

const isUrl = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const isJson = (v) => {
  try { JSON.parse(v); return true; } catch { return false; }
};

const isYaml = (v) => {
  if (v.includes('\t')) return false;
  return v.split('\n').every((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || t === '---') return true;
    return /^-\s?.*/.test(t) || /^[^:\s][^:]*:(\s.*)?$/.test(t);
  });
};

const FORMATS = {
  ip: isIp, cidr: isCidr, fqdn: (s) => FQDN.test(s), email: (s) => EMAIL.test(s), url: isUrl, json: isJson, yaml: isYaml,
};

const NUMERIC = ['number', 'integer', 'float'];
const MULTI = ['multiselect', 'tags'];
const CHOICE = ['select', 'radio'];

const isEmpty = (value) => value === null || value === undefined || value === ''
  || (Array.isArray(value) && value.length === 0) || value === false;

const optionValues = (field) => (Array.isArray(field.options) ? field.options.map((o) => String(o.value)) : []);

/** Valide et normalise une valeur ; renvoie { value } ou { error: { key, v } }. */
const checkField = (field, raw) => {
  const rules = field.validation || {};

  if (isEmpty(raw)) {
    if (field.required) return { error: { key: 'form_required' } };
    return { value: field.type === 'checkbox' ? false : null };
  }

  if (field.type === 'checkbox') {
    if (typeof raw !== 'boolean') return { error: { key: 'err_type' } };
    return { value: raw };
  }

  if (NUMERIC.includes(field.type)) {
    if (typeof raw !== 'number' && typeof raw !== 'string') return { error: { key: 'err_number' } };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { error: { key: 'err_number' } };
    if (field.type === 'integer' && !Number.isInteger(n)) return { error: { key: 'err_integer' } };
    if (rules.min !== undefined && n < rules.min) return { error: { key: 'err_min', v: rules.min } };
    if (rules.max !== undefined && n > rules.max) return { error: { key: 'err_max', v: rules.max } };
    return { value: n };
  }

  let values;
  if (MULTI.includes(field.type)) {
    if (!Array.isArray(raw) || raw.length > MAX_ITEMS || raw.some((item) => typeof item !== 'string')) {
      return { error: { key: 'err_type' } };
    }
    values = raw;
  } else {
    if (typeof raw !== 'string' && typeof raw !== 'number') return { error: { key: 'err_type' } };
    values = [String(raw)];
  }

  const options = optionValues(field);
  const restricted = options.length > 0 && (CHOICE.includes(field.type) || field.type === 'multiselect');

  for (const s of values) {
    if (s.length > MAX_TEXT) return { error: { key: 'err_max_length', v: MAX_TEXT } };
    if (restricted && !options.includes(s)) return { error: { key: 'err_option' } };
    if (rules.min_length !== undefined && s.length < rules.min_length) return { error: { key: 'err_min_length', v: rules.min_length } };
    if (rules.max_length !== undefined && s.length > rules.max_length) return { error: { key: 'err_max_length', v: rules.max_length } };
    if (rules.regex) {
      let re = null;
      try { re = new RegExp(rules.regex); } catch { re = null; }
      if (re && !re.test(s)) return { error: { key: 'err_regex' } };
    }
    if ((field.type === 'date' || field.type === 'datetime') && Number.isNaN(Date.parse(s))) {
      return { error: { key: 'err_date' } };
    }
    const fmt = rules.format || (['email', 'url', 'json', 'yaml'].includes(field.type) ? field.type : null);
    if (fmt && FORMATS[fmt] && !FORMATS[fmt](s)) return { error: { key: `err_${fmt}` } };
  }

  return { value: MULTI.includes(field.type) ? values : values[0] };
};

/**
 * Valide `payload` contre les champs du schéma.
 * Renvoie { values, errors, secrets } : values ne contient que les champs du
 * schéma ; secrets liste les champs « password » (chiffrés avant stockage).
 */
const validatePayload = (fields, payload) => {
  const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const values = {};
  const errors = [];
  for (const field of fields || []) {
    if (!field || typeof field.name !== 'string') continue;
    const result = checkField(field, input[field.name]);
    if (result.error) errors.push({ field: field.name, ...result.error });
    else if (result.value !== null) values[field.name] = result.value;
  }
  const secrets = (fields || []).filter((f) => f && f.type === 'password').map((f) => f.name);
  return { values, errors, secrets };
};

/**
 * Service sans formulaire : seules les valeurs simples (texte, nombre,
 * booléen, liste de textes) sont conservées.
 */
const sanitizeFreePayload = (payload) => {
  const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const values = {};
  Object.entries(input).slice(0, 100).forEach(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) return;
    if (typeof value === 'string') values[key] = value.slice(0, MAX_TEXT);
    else if (typeof value === 'number' && Number.isFinite(value)) values[key] = value;
    else if (typeof value === 'boolean') values[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      values[key] = value.slice(0, MAX_ITEMS).map((item) => item.slice(0, MAX_TEXT));
    }
  });
  return values;
};

module.exports = { validatePayload, sanitizeFreePayload };
