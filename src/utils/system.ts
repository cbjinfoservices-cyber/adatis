import { api } from '@/utils/api';

export interface SystemMigration {
  version: string;
  applied_at: string;
}

export interface SystemTable {
  name: string;
  rows: number;
}

export interface SystemDatabase {
  status: 'up' | 'down';
  name: string | null;
  version: string | null;
  sizeBytes: number | null;
  connections: number | null;
  latencyMs: number | null;
  error: string | null;
}

export interface SystemApi {
  version: string;
  uptimeSec: number;
  node: string;
  env: string;
  startedAt: string;
}

export type SystemBucketStatus = 'up' | 'partial' | 'down' | 'unknown';

export interface SystemHistoryBucket {
  start: string;
  end: string;
  up: number;
  down: number;
  total: number;
  latencyMs: number | null;
  status: SystemBucketStatus;
}

export interface SystemHistory {
  windowHours: number;
  bucketMinutes: number;
  buckets: SystemHistoryBucket[];
  checks: number;
  downChecks: number;
  uptimePct: number | null;
  avgLatencyMs: number | null;
}

export interface SystemSettings {
  retentionDays: number;
  alertThresholdPct: number;
  alertEmail: string | null;
  alertsEnabled: boolean;
  emailConfigured: boolean;
}

export interface SystemAlert {
  id: number;
  windowStart: string;
  windowEnd: string;
  uptimePct: number;
  thresholdPct: number;
  checks: number;
  downChecks: number;
  recipient: string | null;
  emailSent: boolean;
  emailError: string | null;
  createdAt: string;
}

export interface SystemLastHour {
  windowStart: string;
  windowEnd: string;
  uptimePct: number | null;
  checks: number;
  downChecks: number;
  avgLatencyMs: number | null;
}

export interface SystemInfo {
  status: 'ok' | 'degraded';
  checkedAt: string;
  api: SystemApi;
  database: SystemDatabase;
  migrations: SystemMigration[];
  tables: SystemTable[];
  history: SystemHistory;
  settings: SystemSettings;
  alerts: SystemAlert[];
  lastHour: SystemLastHour;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  latencyMs: number | null;
  apiVersion: string;
  uptimeSec: number;
  checkedAt: string;
  error?: string;
}

export const fetchSystemHealth = () => api.get<SystemHealth>('/system/health');

export const fetchSystemInfo = () => api.get<SystemInfo>('/system');

export const updateSystemSettings = (patch: Partial<Pick<SystemSettings, 'retentionDays' | 'alertThresholdPct' | 'alertEmail' | 'alertsEnabled'>>) => (
  api.patch<{ settings: SystemSettings }>('/system/settings', patch)
);

/** Options de rétention proposées dans la page Système. */
export const RETENTION_OPTIONS = [3, 7, 14, 30, 60] as const;

export const formatBytes = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
};

export const formatUptime = (
  seconds: number,
  units: { d: string; h: string; m: string; s: string },
) => {
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (days > 0) return `${days} ${units.d} ${hours} ${units.h}`;
  if (hours > 0) return `${hours} ${units.h} ${minutes} ${units.m}`;
  if (minutes > 0) return `${minutes} ${units.m} ${rest} ${units.s}`;
  return `${rest} ${units.s}`;
};

/** Version PostgreSQL lisible : « PostgreSQL 16.4 on x86_64… » -> « PostgreSQL 16.4 ». */
export const shortPostgresVersion = (raw: string | null) => {
  if (!raw) return '—';
  const match = raw.match(/^PostgreSQL\s+([\w.]+)/i);
  return match ? `PostgreSQL ${match[1]}` : raw;
};