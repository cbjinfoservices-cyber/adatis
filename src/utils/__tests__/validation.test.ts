import { describe, expect, it } from 'vitest';
import type { FieldValidation, FieldValue, FormField } from '@/types/catalog';
import { validateField } from '@/utils/validation';

const field = (over: Partial<FormField>): FormField => ({
  name: 'f', type: 'text', label: { fr: 'F', en: 'F' }, ...over,
});

describe('validateField — champ vide', () => {
  it.each<FieldValue | undefined>([null, undefined, '', [], false])('exige %j si le champ est obligatoire', (value) => {
    expect(validateField(field({ required: true }), value as FieldValue)).toEqual({ key: 'form_required' });
  });

  it('accepte une valeur vide si le champ est facultatif', () => {
    expect(validateField(field({ validation: { min_length: 3 } }), '')).toBeNull();
  });
});

describe('validateField — nombres', () => {
  it('refuse une valeur non numérique', () => {
    expect(validateField(field({ type: 'number' }), 'abc')).toEqual({ key: 'err_number' });
  });

  it('refuse un décimal pour un entier', () => {
    expect(validateField(field({ type: 'integer' }), '2.5')).toEqual({ key: 'err_integer' });
  });

  it('applique min et max', () => {
    const f = field({ type: 'number', validation: { min: 1, max: 10 } });
    expect(validateField(f, 0)).toEqual({ key: 'err_min', v: 1 });
    expect(validateField(f, 11)).toEqual({ key: 'err_max', v: 10 });
    expect(validateField(f, 5)).toBeNull();
  });
});

describe('validateField — texte', () => {
  it('applique les longueurs', () => {
    const f = field({ validation: { min_length: 2, max_length: 4 } });
    expect(validateField(f, 'a')).toEqual({ key: 'err_min_length', v: 2 });
    expect(validateField(f, 'abcde')).toEqual({ key: 'err_max_length', v: 4 });
    expect(validateField(f, 'abc')).toBeNull();
  });

  it('applique l’expression régulière', () => {
    const f = field({ validation: { regex: '^srv-\\d+$' } });
    expect(validateField(f, 'srv-12')).toBeNull();
    expect(validateField(f, 'web-12')).toEqual({ key: 'err_regex' });
  });

  it('valide chaque élément d’une liste', () => {
    const f = field({ type: 'multiselect', validation: { min_length: 2 } });
    expect(validateField(f, ['ab', 'c'])).toEqual({ key: 'err_min_length', v: 2 });
  });
});

describe('validateField — formats', () => {
  const cases: [FieldValidation['format'], string[], string[]][] = [
    ['ip', ['10.0.0.1', '255.255.255.255', 'fe80::1'], ['256.0.0.1', '10.0.0', 'abc']],
    ['cidr', ['10.0.0.0/8', '10.0.0.0/32', 'fe80::/64'], ['10.0.0.0/33', '10.0.0.0', '10.0.0.0/x', 'fe80::/129']],
    ['fqdn', ['srv01.example.com', 'a.b.fr'], ['localhost', '-bad.example.com', 'a..b']],
    ['email', ['alice@example.com'], ['alice', 'alice@', 'a b@example.com']],
    ['url', ['https://example.com', 'http://x.y/z'], ['ftp://example.com', 'example.com']],
    ['json', ['{"a":1}', '[]'], ['{a:1}', '{']],
    ['yaml', ['a: 1\n- b\n# commentaire\n---'], ['\ta: 1', 'pas de deux-points']],
  ];

  describe.each(cases)('%s', (format, valid, invalid) => {
    const f = field({ validation: { format } });
    it.each(valid)('accepte %j', (value) => expect(validateField(f, value)).toBeNull());
    it.each(invalid)('refuse %j', (value) => expect(validateField(f, value)).toEqual({ key: `err_${format}` }));
  });

  it('déduit le format du type de champ', () => {
    expect(validateField(field({ type: 'email' }), 'x')).toEqual({ key: 'err_email' });
    expect(validateField(field({ type: 'json' }), '{')).toEqual({ key: 'err_json' });
  });
});
