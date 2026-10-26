import type { FormField, FieldValue } from '@/types/catalog';

export interface ValidationError { key: string; v?: string | number }

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;
const FQDN = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isIp = (v: string) => IPV4.test(v) || (v.includes(':') && IPV6.test(v));

const isCidr = (v: string) => {
  const [ip, mask] = v.split('/');
  if (!ip || mask === undefined || !/^\d+$/.test(mask)) return false;
  const m = Number(mask);
  if (IPV4.test(ip)) return m >= 0 && m <= 32;
  return isIp(ip) && m >= 0 && m <= 128;
};

const isUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const isJson = (v: string) => {
  try { JSON.parse(v); return true; } catch { return false; }
};

const isYaml = (v: string) => {
  if (v.includes('\t')) return false;
  return v.split('\n').every((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || t === '---') return true;
    return /^-\s?.*/.test(t) || /^[^:\s][^:]*:(\s.*)?$/.test(t);
  });
};

const checkFormat = (format: string, v: string): string | null => {
  const map: Record<string, (s: string) => boolean> = {
    ip: isIp, cidr: isCidr, fqdn: (s) => FQDN.test(s), email: (s) => EMAIL.test(s), url: isUrl, json: isJson, yaml: isYaml,
  };
  const fn = map[format];
  return fn && !fn(v) ? `err_${format}` : null;
};

const isEmpty = (value: FieldValue) => value === null || value === undefined || value === ''
  || (Array.isArray(value) && value.length === 0) || value === false;

export const validateField = (field: FormField, value: FieldValue): ValidationError | null => {
  if (isEmpty(value)) return field.required ? { key: 'form_required' } : null;
  const rules = field.validation || {};

  if (['number', 'integer', 'float'].includes(field.type)) {
    const n = Number(value);
    if (Number.isNaN(n)) return { key: 'err_number' };
    if (field.type === 'integer' && !Number.isInteger(n)) return { key: 'err_integer' };
    if (rules.min !== undefined && n < rules.min) return { key: 'err_min', v: rules.min };
    if (rules.max !== undefined && n > rules.max) return { key: 'err_max', v: rules.max };
    return null;
  }

  const values = Array.isArray(value) ? value : [String(value)];
  for (let i = 0; i < values.length; i += 1) {
    const s = values[i];
    if (rules.min_length !== undefined && s.length < rules.min_length) return { key: 'err_min_length', v: rules.min_length };
    if (rules.max_length !== undefined && s.length > rules.max_length) return { key: 'err_max_length', v: rules.max_length };
    if (rules.regex && !new RegExp(rules.regex).test(s)) return { key: 'err_regex' };
    const fmt = rules.format || (field.type === 'email' ? 'email' : null) || (field.type === 'url' ? 'url' : null)
      || (field.type === 'json' ? 'json' : null) || (field.type === 'yaml' ? 'yaml' : null);
    if (fmt) {
      const err = checkFormat(fmt, s);
      if (err) return { key: err };
    }
  }
  return null;
};