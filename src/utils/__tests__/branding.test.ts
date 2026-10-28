import { describe, expect, it } from 'vitest';
import { domainIsValid, renderEmailTemplate, urlHost } from '@/utils/branding';

describe('renderEmailTemplate', () => {
  it('remplace chaque jeton, espaces tolérés', () => {
    expect(renderEmailTemplate('{{ ref }} · {{service}} sur {{platform}} ({{ref}})', {
      ref: 'REQ-1', service: 'VM', platform: 'ASP',
    })).toBe('REQ-1 · VM sur ASP (REQ-1)');
  });
});

describe('domaine personnalisé', () => {
  it.each(['portail.example.com', 'A.B'])('accepte %j', (v) => expect(domainIsValid(v)).toBe(true));
  it.each(['localhost', '-x.example.com', 'a b.com', ''])('refuse %j', (v) => expect(domainIsValid(v)).toBe(false));

  it('extrait l’hôte d’une URL, vide sinon', () => {
    expect(urlHost(' https://portail.example.com/x ')).toBe('portail.example.com');
    expect(urlHost('pas une url')).toBe('');
  });
});
