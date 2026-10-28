import { useTranslation } from 'react-i18next';
import type { connectorTotals } from '@/utils/connectors';

/** Quatre indicateurs en tête de page. */
export default function ConnectorKpis({ totals }: { totals: ReturnType<typeof connectorTotals> }) {
  const { t } = useTranslation();
  const kpis = [
    { key: 'connected', label: t('admin_kpi_connected'), value: totals.connected, icon: 'ri-plug-line', tone: 'bg-background-200 text-foreground-800' },
    { key: 'healthy', label: t('admin_kpi_healthy'), value: totals.healthy, icon: 'ri-heart-pulse-line', tone: 'bg-primary-100 text-primary-700 dark:text-primary-900' },
    { key: 'catalog', label: t('admin_kpi_catalog'), value: totals.catalog, icon: 'ri-stack-line', tone: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900' },
    { key: 'jobs', label: t('admin_kpi_jobs'), value: totals.jobs, icon: 'ri-play-circle-line', tone: 'bg-accent-100 text-accent-900' },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
      {kpis.map((k) => (
        <div key={k.key} className="p-4 rounded-xl bg-background-50 border border-background-200">
          <div className="flex items-start justify-between gap-2">
            <span className="font-label text-[11px] uppercase tracking-wider text-foreground-500">{k.label}</span>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${k.tone}`}><i className={k.icon} /></span>
          </div>
          <p className="mt-3 font-heading text-2xl md:text-3xl font-bold text-foreground-950">{k.value}</p>
        </div>
      ))}
    </div>
  );
}
