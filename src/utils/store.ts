import { useSyncExternalStore } from 'react';
import { api } from '@/utils/api';
import type { CategoryId, ProjectItem, ServiceItem } from '@/types/catalog';
import type { Connector } from '@/utils/connectors';
import type { ApprovalItem, AuditEntry } from '@/utils/approvals';
import type { RequestItem } from '@/utils/executions';
import type { TenantBranding } from '@/utils/branding';

export interface CategoryItem { id: CategoryId; icon: string }

export interface AdapterItem {
  kind: string;
  name: string;
  icon: string;
  description: { fr: string; en: string };
  connectors?: number;
}

export interface BatchTestEntry {
  id: number;
  at: string;
  total: number;
  ok: number;
  failed: number;
  avgLatencyMs: number;
  durationMs: number;
}

export interface TopService { name: { fr: string; en: string }; value: number }
export interface TopUser { name: string; initials: string; role: string; jobs: number; rate: number }
export interface TopTenant { name: string; plan: string; jobs: number; rate: number }

export interface DashboardData {
  totalJobs: number;
  successRate: number;
  failures: number;
  avgDurationSec: number;
  trendTotal: number[];
  statusDistribution: { key: string; value: number }[];
  topServices: TopService[];
  topUsers: TopUser[];
  topTenants: TopTenant[];
}

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface StoreState {
  status: StoreStatus;
  error: string | null;
  failedResources: string[];
  services: ServiceItem[];
  projects: ProjectItem[];
  categories: CategoryItem[];
  requests: RequestItem[];
  approvals: ApprovalItem[];
  audit: AuditEntry[];
  connectors: Connector[];
  adapters: AdapterItem[];
  batchTests: BatchTestEntry[];
  tenants: TenantBranding[];
  dashboard: DashboardData | null;
}

const initialState: StoreState = {
  status: 'idle',
  error: null,
  failedResources: [],
  services: [],
  projects: [],
  categories: [],
  requests: [],
  approvals: [],
  audit: [],
  connectors: [],
  adapters: [],
  batchTests: [],
  tenants: [],
  dashboard: null,
};

let state: StoreState = initialState;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = () => state;

const commit = (patch: Partial<StoreState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const getStoreState = () => state;

export const useStore = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

let inflight: Promise<void> | null = null;

const RESOURCES = [
  'services', 'projects', 'categories', 'requests', 'approvals',
  'audit', 'connectors', 'adapters', 'batchTests', 'tenants', 'dashboard',
] as const;

/** Charge (une seule fois) l'ensemble des données du portail depuis l'API. */
export const loadStore = (force = false): Promise<void> => {
  if (!force && state.status === 'ready') return Promise.resolve();
  if (!force && inflight) return inflight;

  commit({ status: 'loading', error: null, failedResources: [] });

  inflight = (async () => {
    const results = await Promise.allSettled([
      api.get<ServiceItem[]>('/services'),
      api.get<ProjectItem[]>('/projects'),
      api.get<CategoryItem[]>('/categories'),
      api.get<RequestItem[]>('/requests?limit=200'),
      api.get<ApprovalItem[]>('/approvals'),
      api.get<AuditEntry[]>('/audit?limit=200'),
      api.get<Connector[]>('/connectors'),
      api.get<AdapterItem[]>('/adapters'),
      api.get<BatchTestEntry[]>('/batch-tests?limit=3'),
      api.get<TenantBranding[]>('/tenants'),
      api.get<DashboardData>('/dashboard'),
    ]);

    const failed: string[] = [];
    const value = <T>(index: number, fallback: T): T => {
      const result = results[index];
      if (result.status === 'fulfilled') return result.value as T;
      failed.push(RESOURCES[index]);
      return fallback;
    };

    commit({
      services: value(0, []),
      projects: value(1, []),
      categories: value(2, []),
      requests: value(3, []),
      approvals: value(4, []),
      audit: value(5, []),
      connectors: value(6, []),
      adapters: value(7, []),
      batchTests: value(8, []),
      tenants: value(9, []),
      dashboard: value(10, null),
      failedResources: failed,
      status: failed.length === RESOURCES.length ? 'error' : 'ready',
      error: failed.length === RESOURCES.length
        ? "Aucune donnée n'a pu être chargée depuis l'API."
        : null,
    });
    inflight = null;
  })();

  return inflight;
};

export const reloadStore = () => {
  inflight = null;
  return loadStore(true);
};

/** Remplace une tranche du store après une mutation (PATCH / POST). */
export const patchStore = (patch: Partial<StoreState>) => commit(patch);

export const categoryIconOf = (id: CategoryId): string =>
  state.categories.find((c) => c.id === id)?.icon || 'ri-tools-line';