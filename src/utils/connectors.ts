import type { I18nText } from '@/types/catalog';
import { csvCell } from '@/utils/csv';

export type ConnectorKind =
  | 'ascender' | 'jenkins' | 'terraform' | 'gitlab' | 'azuredevops'
  | 'argocd' | 'rundeck' | 'servicenow';

export type Health = 'healthy' | 'degraded' | 'down' | 'pending';
export type MapStatus = 'mapped' | 'review' | 'ignored';
export type ConnectorScope = 'tenant' | 'platform';

export interface ConnectorCatalogItem {
  id: string;
  name: I18nText;
  engineRef: string;
  category: string;
  status: MapStatus;
  lastSync: string;
}

export interface ConnectorCheck {
  label: I18nText;
  ok: boolean;
}

export interface ConnectorTestEntry {
  at: string;
  ok: boolean;
  latency: number;
  error: string | null;
}

export type ConnectorChangeField = 'name' | 'endpoint' | 'notes' | 'import';

export interface ConnectorChange {
  at: string;
  author: string;
  field: ConnectorChangeField;
  before: string;
  after: string;
}

export interface Connector {
  id: string;
  kind: ConnectorKind;
  name: string;
  endpoint: string;
  endpointDefault: string;
  authMode: string;
  version: string;
  notes?: string;
  retestRequiredAt?: string | null;
  configured?: boolean;
  /** Connecteur Ascender : configuré par les variables AWX_*, tests réels. */
  managed?: boolean;
  health: Health;
  latencyMs: number;
  uptime: number;
  lastSync: string | null;
  jobs24h: number;
  successRate: number;
  scope: ConnectorScope;
  capabilities: string[];
  checks: ConnectorCheck[];
  catalog: ConnectorCatalogItem[];
  tests: ConnectorTestEntry[];
  history?: ConnectorChange[];
}

export const HEALTH_STYLE: Record<Health, { badge: string; dot: string; icon: string }> = {
  healthy: {
    badge: 'bg-primary-100 text-primary-800 dark:text-primary-900',
    dot: 'bg-primary-500',
    icon: 'ri-checkbox-circle-fill',
  },
  degraded: {
    badge: 'bg-accent-100 text-accent-900',
    dot: 'bg-accent-500',
    icon: 'ri-error-warning-fill',
  },
  down: {
    badge: 'bg-accent-600 text-background-50 dark:text-foreground-950',
    dot: 'bg-accent-600',
    icon: 'ri-close-circle-fill',
  },
  pending: {
    badge: 'bg-background-200 text-foreground-600',
    dot: 'bg-background-400',
    icon: 'ri-time-fill',
  },
};

export const MAP_STYLE: Record<MapStatus, string> = {
  mapped: 'bg-primary-100 text-primary-800 dark:text-primary-900',
  review: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900',
  ignored: 'bg-background-200 text-foreground-600',
};

export const KIND_ICON: Record<ConnectorKind, string> = {
  ascender: 'ri-flashlight-line',
  jenkins: 'ri-hammer-line',
  terraform: 'ri-stack-line',
  gitlab: 'ri-git-branch-line',
  azuredevops: 'ri-microsoft-line',
  argocd: 'ri-node-tree',
  rundeck: 'ri-terminal-box-line',
  servicenow: 'ri-ticket-2-line',
};

/** Nom des moteurs (noms de produits : non traduits). */
export const KIND_LABEL: Record<ConnectorKind, string> = {
  ascender: 'Ascender',
  jenkins: 'Jenkins',
  terraform: 'Terraform Cloud',
  gitlab: 'GitLab CI',
  azuredevops: 'Azure DevOps',
  argocd: 'Argo CD',
  rundeck: 'Rundeck',
  servicenow: 'ServiceNow',
};

export const kindLabel = (kind: string) => KIND_LABEL[kind as ConnectorKind] || kind;

export const endpointIsValid = (value: string) => {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const okProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    return okProtocol && url.hostname.includes('.');
  } catch {
    return false;
  }
};

export const publishedCount = (connector: Connector) =>
  connector.catalog.filter((c) => c.status === 'mapped').length;

export const reviewCount = (connector: Connector) =>
  connector.catalog.filter((c) => c.status === 'review').length;

export const latestTest = (connector: Connector): ConnectorTestEntry | null =>
  connector.tests.length > 0 ? connector.tests[0] : null;

export const latestFailure = (connector: Connector): ConnectorTestEntry | null =>
  connector.tests.find((entry) => !entry.ok) || null;

export const endpointIsOriginal = (connector: Connector, endpoint: string) =>
  endpoint.trim() === connector.endpointDefault.trim();

export const needsRetest = (connector: Connector) => !!connector.retestRequiredAt;

export const recordTest = (
  connector: Connector,
  entry: ConnectorTestEntry,
): ConnectorTestEntry[] => [entry, ...connector.tests].slice(0, 8);

export type HealthFilter = 'all' | 'healthy' | 'degraded' | 'pending';

export const HEALTH_FILTERS: HealthFilter[] = ['all', 'healthy', 'degraded', 'pending'];

export const matchesHealthFilter = (health: Health, filter: HealthFilter) => {
  if (filter === 'all') return true;
  if (filter === 'healthy') return health === 'healthy';
  if (filter === 'degraded') return health === 'degraded' || health === 'down';
  return health === 'pending';
};

export type ConnectorSort = 'recent_test' | 'latency' | 'sync';

export const CONNECTOR_SORTS: ConnectorSort[] = ['recent_test', 'latency', 'sync'];

const timeOf = (value: string | null) => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

const lastTestTime = (connector: Connector) =>
  (connector.tests.length > 0 ? timeOf(connector.tests[0].at) : Number.NEGATIVE_INFINITY);

export const sortConnectors = (items: Connector[], sort: ConnectorSort): Connector[] => {
  const list = [...items];
  list.sort((a, b) => {
    if (sort === 'latency') {
      const left = a.latencyMs > 0 ? a.latencyMs : Number.POSITIVE_INFINITY;
      const right = b.latencyMs > 0 ? b.latencyMs : Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
      return a.name.localeCompare(b.name);
    }
    if (sort === 'sync') {
      const diff = timeOf(b.lastSync) - timeOf(a.lastSync);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    }
    const diff = lastTestTime(b) - lastTestTime(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
  return list;
};


export const testsToCsv = (
  connector: Connector,
  labels: {
    date: string; status: string; latency: string; error: string; ok: string; fail: string;
    connector: string; endpoint: string; notes: string; lastTest: string;
  },
  locale: string,
) => {
  const stamp = (value: string) =>
    new Date(value).toLocaleString(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  const last = latestTest(connector);
  const meta: string[][] = [
    [labels.connector, connector.name],
    [labels.endpoint, connector.endpoint],
    [labels.lastTest, last ? stamp(last.at) : ''],
    [labels.notes, (connector.notes || '').trim()],
  ];
  const lines = [
    ...meta,
    [],
    [labels.date, labels.status, labels.latency, labels.error],
    ...connector.tests.map((entry) => [
      stamp(entry.at),
      entry.ok ? labels.ok : labels.fail,
      entry.ok ? String(entry.latency) : '',
      entry.error || '',
    ]),
  ];
  return lines.map((row) => row.map(csvCell).join(';')).join('\r\n');
};

export const csvFileName = (connector: Connector) => {
  const slug = connector.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const day = new Date().toISOString().slice(0, 10);
  return `tests-${slug || 'connecteur'}-${day}.csv`;
};

export const downloadCsv = (fileName: string, content: string) => {
  const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/* --- Search --- */

export const hostnameOf = (endpoint: string) => {
  const raw = (endpoint || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname;
  } catch {
    return raw;
  }
};

export const matchesSearch = (connector: Connector, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const terms = [
    connector.name,
    connector.endpoint,
    hostnameOf(connector.endpoint),
    connector.notes || '',
  ];
  return terms.some((term) => term.toLowerCase().includes(needle));
};

/* --- Portable configuration (JSON export / import between environments) --- */

export interface ConnectorConfigEntry {
  id: string;
  kind: ConnectorKind;
  name: string;
  endpoint: string;
  endpointDefault: string;
  authMode: string;
  scope: ConnectorScope;
  capabilities: string[];
  notes: string;
  configured: boolean;
}

export interface ConnectorConfigBundle {
  kind: 'connector-config';
  version: 1;
  exportedAt: string;
  connectors: ConnectorConfigEntry[];
}

export const toConfigBundle = (items: Connector[]): ConnectorConfigBundle => ({
  kind: 'connector-config',
  version: 1,
  exportedAt: new Date().toISOString(),
  connectors: items.map((connector) => ({
    id: connector.id,
    kind: connector.kind,
    name: connector.name,
    endpoint: connector.endpoint,
    endpointDefault: connector.endpointDefault,
    authMode: connector.authMode,
    scope: connector.scope,
    capabilities: [...connector.capabilities],
    notes: connector.notes || '',
    configured: connector.configured !== false && connector.endpoint !== '—',
  })),
});

export const configBundleFileName = () => `connecteurs-config-${new Date().toISOString().slice(0, 10)}.json`;

export const configSelectionFileName = () => `connecteurs-selection-${new Date().toISOString().slice(0, 10)}.json`;

export const configTemplateBundle = (): ConnectorConfigBundle => ({
  kind: 'connector-config',
  version: 1,
  exportedAt: new Date().toISOString(),
  connectors: [
    {
      id: 'cn-gitlab-example',
      kind: 'gitlab',
      name: 'GitLab',
      endpoint: 'https://gitlab.example.com/api/v4',
      endpointDefault: 'https://gitlab.example.com/api/v4',
      authMode: 'Personal access token',
      scope: 'tenant',
      capabilities: ['pipelines', 'projects'],
      notes: '',
      configured: false,
    },
  ],
});

export const configTemplateFileName = () => 'connecteurs-modele.json';

export const downloadJson = (fileName: string, content: string) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const isConnectorKind = (value: unknown): value is ConnectorKind =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(KIND_ICON, value);

export const parseConfigBundle = (
  raw: string,
): { entries: ConnectorConfigEntry[] | null; error: 'invalid' | 'empty' | null } => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { entries: null, error: 'invalid' };
  }
  const list = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as { connectors?: unknown }).connectors)
      ? (data as { connectors: unknown[] }).connectors
      : null);
  if (!list) return { entries: null, error: 'invalid' };

  const entries: ConnectorConfigEntry[] = [];
  list.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const source = item as Record<string, unknown>;
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (!name || !isConnectorKind(source.kind)) return;
    const endpoint = typeof source.endpoint === 'string' ? source.endpoint.trim() : '';
    entries.push({
      id: typeof source.id === 'string' && source.id ? source.id : `cn-${source.kind}-imp${index}`,
      kind: source.kind,
      name,
      endpoint: endpoint || '—',
      endpointDefault: typeof source.endpointDefault === 'string' && source.endpointDefault ? source.endpointDefault : (endpoint || '—'),
      authMode: typeof source.authMode === 'string' && source.authMode ? source.authMode : '—',
      scope: source.scope === 'platform' ? 'platform' : 'tenant',
      capabilities: Array.isArray(source.capabilities)
        ? source.capabilities.filter((value): value is string => typeof value === 'string')
        : [],
      notes: typeof source.notes === 'string' ? source.notes : '',
      configured: source.configured !== false && !!endpoint && endpoint !== '—',
    });
  });

  if (entries.length === 0) return { entries: [], error: 'empty' };
  return { entries, error: null };
};

export type ImportMatchStrategy = 'name' | 'kind';

const normalizeName = (value: string) => value.trim().toLowerCase();

export const configEntryMatches = (
  items: Connector[],
  entry: ConnectorConfigEntry,
  strategy: ImportMatchStrategy = 'name',
) => {
  const byId = items.find((c) => c.id === entry.id);
  if (byId) return byId;
  if (strategy === 'name') {
    const byName = items.find((c) => normalizeName(c.name) === normalizeName(entry.name));
    if (byName) return byName;
  }
  return items.find((c) => c.kind === entry.kind) || null;
};