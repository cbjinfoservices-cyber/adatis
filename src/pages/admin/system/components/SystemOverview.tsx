import { useTranslation } from 'react-i18next';
import type { SystemInfo } from '@/utils/system';
import { formatUptime } from '@/utils/system';

const stateTone = (up: boolean) => (up
  ? 'bg-primary-100 text-primary-800 dark:text-primary-900'
  : 'bg-accent-100 text-accent-900');

export default function SystemOverview({ info }: { info: SystemInfo }) {
  const { t } = useTranslation();
  const apiUp = true;
  const dbUp = info.database.status === 'up';

  const kpis = [
    {
      key: 'api',
      label: t('sys_kpi_api'),
      value: apiUp ? t('sys_up') : t('sys_down'),
      hint: `v${info.api.version}`,
      icon: apiUp ? 'ri-server-line' : 'ri-cloud-off-line',
      tone: stateTone(apiUp),
    },
    {
      key: 'db',
      label: t('sys_kpi_db'),
      value: dbUp ? t('sys_up') : t('sys_down'),
      hint: info.database.latencyMs === null ? '—' : `${info.database.latencyMs} ms`,
      icon: dbUp ? 'ri-database-2-line' : 'ri-error-warning-line',
      tone: stateTone(dbUp),
    },
    {
      key: 'migrations',
      label: t('sys_kpi_migrations'),
      value: String(info.migrations.length),
      hint: info.migrations.length > 0
        ? (info.migrations[info.migrations.length - 1].version)
        : t('sys_migrations_empty'),
      icon: 'ri-node-tree',
      tone: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900',
    },
    {
      key: 'uptime',
      label: t('sys_kpi_uptime'),
      value: formatUptime(info.api.uptimeSec, {
        d: t('sys_unit_d'),
        h: t('sys_unit_h'),
        m: t('sys_unit_m'),
        s: t('sys_unit_s'),
      }),
      hint: info.api.env,
      icon: 'ri-timer-line',
      tone: 'bg-background-200 text-foreground-800',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
      {kpis.map((kpi) => (
        <div key={kpi.key} className="p-4 rounded-xl bg-background-50 border border-background-200">
          <div className="flex items-start justify-between gap-2">
            <span className="font-label text-[11px] uppercase tracking-wider text-foreground-500">{kpi.label}</span>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${kpi.tone}`}>
              <i className={kpi.icon} />
            </span>
          </div>
          <p className="mt-3 font-heading text-xl md:text-2xl font-bold text-foreground-950 leading-tight">{kpi.value}</p>
          <p className="mt-1 font-label text-[11px] text-foreground-500 truncate" title={kpi.hint}>{kpi.hint}</p>
        </div>
      ))}
    </div>
  );
}