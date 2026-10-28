import { describe, expect, it } from 'vitest';
import {
  configEntryMatches, connectorTotals, csvFileName, endpointIsValid, hostnameOf, matchesHealthFilter, matchesSearch,
  parseConfigBundle, recordTest, sortConnectors, testsToCsv, toConfigBundle,
  type Connector, type ConnectorTestEntry,
} from '@/utils/connectors';

const connector = (over: Partial<Connector>): Connector => ({
  id: 'cn-1', kind: 'jenkins', name: 'Jenkins', endpoint: 'https://ci.example.com', endpointDefault: 'https://ci.example.com',
  authMode: 'token', version: '1', health: 'healthy', latencyMs: 100, uptime: 100, lastSync: null,
  jobs24h: 0, successRate: 100, scope: 'tenant', capabilities: [], checks: [], catalog: [], tests: [], ...over,
});

const attempt = (at: string, ok = true): ConnectorTestEntry => ({ at, ok, latency: 10, error: ok ? null : 'boom' });

describe('endpointIsValid', () => {
  it.each(['https://ci.example.com', ' http://a.b/path '])('accepte %j', (v) => expect(endpointIsValid(v)).toBe(true));
  it.each(['', 'ftp://a.b', 'https://localhost', 'pas une url'])('refuse %j', (v) => expect(endpointIsValid(v)).toBe(false));
});

describe('matchesHealthFilter', () => {
  it('regroupe « dégradé » et « en panne »', () => {
    expect(matchesHealthFilter('down', 'degraded')).toBe(true);
    expect(matchesHealthFilter('healthy', 'degraded')).toBe(false);
    expect(matchesHealthFilter('pending', 'all')).toBe(true);
  });
});

describe('sortConnectors', () => {
  const a = connector({ id: 'a', name: 'A', latencyMs: 0, lastSync: '2026-01-02T00:00:00Z', tests: [attempt('2026-01-01T00:00:00Z')] });
  const b = connector({ id: 'b', name: 'B', latencyMs: 50, lastSync: null, tests: [attempt('2026-01-03T00:00:00Z')] });
  const c = connector({ id: 'c', name: 'C', latencyMs: 20, lastSync: '2026-01-01T00:00:00Z', tests: [] });

  it('trie par test le plus récent par défaut', () => {
    expect(sortConnectors([a, b, c], 'recent_test').map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('place les latences inconnues en dernier', () => {
    expect(sortConnectors([a, b, c], 'latency').map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('trie par synchronisation, jamais synchronisé en dernier', () => {
    expect(sortConnectors([a, b, c], 'sync').map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('ne modifie pas la liste d’origine', () => {
    const list = [c, b, a];
    sortConnectors(list, 'latency');
    expect(list.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('connectorTotals', () => {
  it('compte les connecteurs actifs et en bonne santé, le catalogue publié et les jobs', () => {
    const item = (status: 'mapped' | 'review') => ({
      id: status, name: { fr: '', en: '' }, engineRef: '', category: '', status, lastSync: '',
    });
    const totals = connectorTotals([
      connector({ health: 'healthy', jobs24h: 3, catalog: [item('mapped'), item('review')] }),
      connector({ health: 'down', jobs24h: 1, catalog: [item('mapped')] }),
      connector({ health: 'pending' }),
    ]);
    expect(totals).toEqual({ connected: 2, healthy: 1, catalog: 3, published: 2, jobs: 4 });
  });
});

describe('recordTest', () => {
  it('ajoute en tête et garde les 8 derniers essais', () => {
    const tests = Array.from({ length: 8 }, (_, i) => attempt(`2026-01-0${i + 1}T00:00:00Z`));
    const next = recordTest(connector({ tests }), attempt('2026-02-01T00:00:00Z'));
    expect(next).toHaveLength(8);
    expect(next[0].at).toBe('2026-02-01T00:00:00Z');
  });
});

describe('recherche', () => {
  it('extrait le nom d’hôte, ou rend la valeur brute', () => {
    expect(hostnameOf('https://ci.example.com:8443/x')).toBe('ci.example.com');
    expect(hostnameOf('pas-une-url')).toBe('pas-une-url');
  });

  it('cherche dans le nom, l’URL et les notes sans tenir compte de la casse', () => {
    const c = connector({ notes: 'Équipe Paris' });
    expect(matchesSearch(c, 'JENKINS')).toBe(true);
    expect(matchesSearch(c, 'paris')).toBe(true);
    expect(matchesSearch(c, 'gitlab')).toBe(false);
    expect(matchesSearch(c, '  ')).toBe(true);
  });
});

describe('export CSV des tests', () => {
  it('produit un nom de fichier sans accents ni espaces', () => {
    expect(csvFileName(connector({ name: 'Déploiement Prod #1' }))).toMatch(/^tests-deploiement-prod-1-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csvFileName(connector({ name: '!!!' }))).toMatch(/^tests-connecteur-/);
  });

  it('liste les essais avec leur statut', () => {
    const labels = {
      date: 'Date', status: 'Statut', latency: 'Latence', error: 'Erreur', ok: 'OK', fail: 'Échec',
      connector: 'Connecteur', endpoint: 'URL', notes: 'Notes', lastTest: 'Dernier test',
    };
    const csv = testsToCsv(connector({ tests: [attempt('2026-01-02T00:00:00Z', false)] }), labels, 'fr-FR');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Connecteur;Jenkins');
    expect(lines.at(-1)).toMatch(/;Échec;;boom$/);
  });
});

describe('configuration portable', () => {
  it('exporte puis réimporte les mêmes connecteurs', () => {
    const bundle = toConfigBundle([connector({ notes: 'n' })]);
    const { entries, error } = parseConfigBundle(JSON.stringify(bundle));
    expect(error).toBeNull();
    expect(entries).toEqual(bundle.connectors);
  });

  it('accepte aussi un simple tableau et complète les valeurs absentes', () => {
    const { entries } = parseConfigBundle(JSON.stringify([{ name: ' GitLab ', kind: 'gitlab' }]));
    expect(entries).toEqual([{
      id: 'cn-gitlab-imp0', kind: 'gitlab', name: 'GitLab', endpoint: '—', endpointDefault: '—',
      authMode: '—', scope: 'tenant', capabilities: [], notes: '', configured: false,
    }]);
  });

  it('signale un JSON invalide ou sans connecteur utilisable', () => {
    expect(parseConfigBundle('{').error).toBe('invalid');
    expect(parseConfigBundle('{"foo":1}').error).toBe('invalid');
    expect(parseConfigBundle('[{"name":"x","kind":"inconnu"}]').error).toBe('empty');
  });

  it('retrouve le connecteur existant par id, puis par nom, puis par moteur', () => {
    const items = [connector({ id: 'a', name: 'CI Paris' }), connector({ id: 'b', name: 'CI Lyon' })];
    const entry = parseConfigBundle(JSON.stringify([{ name: 'ci lyon', kind: 'jenkins' }])).entries![0];
    expect(configEntryMatches(items, { ...entry, id: 'a' })?.id).toBe('a');
    expect(configEntryMatches(items, entry, 'name')?.id).toBe('b');
    expect(configEntryMatches(items, entry, 'kind')?.id).toBe('a');
    expect(configEntryMatches(items, { ...entry, kind: 'gitlab', name: 'x' })).toBeNull();
  });
});
