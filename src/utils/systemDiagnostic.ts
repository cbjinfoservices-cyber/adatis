import {
  formatBytes,
  formatUptime,
  shortPostgresVersion,
  type SystemInfo,
  type SystemMigration,
} from '@/utils/system';
import { csvCell } from '@/utils/csv';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const formatDate = (value: string, language: string) => new Date(value).toLocaleString(language, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const line = (label: string, value: string) => `  ${label}: ${value}`;

/**
 * Texte prêt à coller dans un ticket : version, latences, disponibilité,
 * migrations et volumétrie. Aucune donnée sensible (le secret de base n'est
 * jamais renvoyé par l'API).
 */
export const buildDiagnostic = (info: SystemInfo, t: Translate, language: string) => {
  const { api, database, migrations, tables, history } = info;
  const units = {
    d: t('sys_unit_d'),
    h: t('sys_unit_h'),
    m: t('sys_unit_m'),
    s: t('sys_unit_s'),
  };

  const blocks: string[] = [];

  blocks.push(`${t('sys_diag_title')}`);
  blocks.push(`${t('sys_diag_generated')}: ${formatDate(info.checkedAt, language)}`);
  blocks.push(`${t('sys_diag_status')}: ${info.status === 'ok' ? t('sys_up') : t('sys_down')}`);

  blocks.push([
    `[${t('sys_api_title')}]`,
    line(t('sys_api_version'), api.version),
    line(t('sys_api_node'), api.node),
    line(t('sys_api_env'), api.env),
    line(t('sys_api_started'), formatDate(api.startedAt, language)),
    line(t('sys_kpi_uptime'), formatUptime(api.uptimeSec, units)),
  ].join('\n'));

  blocks.push([
    `[${t('sys_db_title')}]`,
    line(t('sys_diag_state'), database.status === 'up' ? t('sys_up') : t('sys_down')),
    line(t('sys_db_version'), shortPostgresVersion(database.version)),
    line(t('sys_db_name'), database.name || '—'),
    line(t('sys_db_size'), formatBytes(database.sizeBytes)),
    line(t('sys_db_connections'), database.connections === null ? '—' : String(database.connections)),
    line(t('sys_latency'), database.latencyMs === null ? '—' : `${database.latencyMs} ms`),
    ...(database.error ? [line(t('sys_diag_error'), database.error)] : []),
  ].join('\n'));

  blocks.push([
    `[${t('sys_avail_title')} · ${history.windowHours} h]`,
    line(t('sys_avail_uptime'), history.uptimePct === null ? '—' : `${history.uptimePct.toFixed(1)} %`),
    line(t('sys_diag_probes'), String(history.checks)),
    line(t('sys_avail_avg_latency_short'), history.avgLatencyMs === null ? '—' : `${history.avgLatencyMs} ms`),
    line(t('sys_diag_down_probes'), String(history.downChecks)),
  ].join('\n'));

  if (migrations.length === 0) {
    blocks.push([`[${t('sys_migrations_title')}]`, `  ${t('sys_migrations_empty')}`].join('\n'));
  } else {
    blocks.push([
      `[${t('sys_migrations_title')}] (${migrations.length})`,
      ...migrations.map((migration) => `  - ${migration.version} · ${formatDate(migration.applied_at, language)}`),
    ].join('\n'));
  }

  blocks.push([
    `[${t('sys_tables_title')}] (${tables.length})`,
    ...(tables.length === 0
      ? [`  ${t('sys_diag_none')}`]
      : tables.map((table) => `  - ${table.name} (${table.rows})`)),
  ].join('\n'));

  blocks.push(`— ${t('sys_diag_footer')}`);

  return blocks.join('\n\n');
};

/** Copie dans le presse-papiers avec repli pour les navigateurs sans Clipboard API. */
export const copyToClipboard = async (text: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
};

export const migrationsToCsv = (
  migrations: SystemMigration[],
  t: Translate,
  language: string,
) => {
  const header = [t('sys_migrations_col_version'), t('sys_migrations_col_date')];
  const rows = migrations.map((migration) => [
    migration.version,
    formatDate(migration.applied_at, language),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
};

export const migrationsCsvFileName = () => `migrations-${new Date().toISOString().slice(0, 10)}.csv`;