import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '@/utils/csv';
import { adaptersToCsv } from '@/utils/adaptersCsv';
import type { AdapterItem } from '@/utils/store';

describe('csvCell', () => {
  it('laisse une valeur simple telle quelle', () => {
    expect(csvCell('abc')).toBe('abc');
    expect(csvCell(42)).toBe('42');
  });

  it('rend vide une valeur absente', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('met entre guillemets une valeur contenant un séparateur, un guillemet ou un saut de ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
  });

  it.each(['=1+1', '+33', '-2', '@SUM(A1)', '\tx', '\rx'])('neutralise la formule %j', (value) => {
    expect(csvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
  });
});

describe('toCsv', () => {
  it('sépare par « ; » et termine les lignes en CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd;e']])).toBe('a;b\r\nc;"d;e"');
  });
});

describe('adaptersToCsv', () => {
  it('ajoute une ligne d’en-tête et le nombre de connecteurs par adaptateur', () => {
    const adapter = { name: 'Jenkins', kind: 'jenkins', description: { fr: 'Pipelines', en: 'Pipelines' } } as AdapterItem;
    const csv = adaptersToCsv(
      [adapter],
      (kind) => (kind === 'jenkins' ? 3 : 0),
      { name: 'Nom', kind: 'Type', connectors: 'Connecteurs', descFr: 'FR', descEn: 'EN' },
    );
    expect(csv).toBe('Nom;Type;Connecteurs;FR;EN\r\nJenkins;jenkins;3;Pipelines;Pipelines');
  });
});
