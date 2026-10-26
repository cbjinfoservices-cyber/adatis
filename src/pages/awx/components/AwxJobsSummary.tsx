import { useTranslation } from 'react-i18next';
import type { AwxJobsStats } from '@/utils/awxJobs';

const CARDS: { key: keyof AwxJobsStats; label: string; icon: string; tone: string }[] = [
  { key: 'total', label: 'awx_track_stat_total', icon: 'ri-stack-line', tone: 'bg-background-200 text-foreground-800' },
  { key: 'active', label: 'awx_track_stat_active', icon: 'ri-loader-4-line', tone: 'bg-primary-100 text-primary-800 dark:text-primary-900' },
  { key: 'success', label: 'awx_track_stat_success', icon: 'ri-check-double-line', tone: 'bg-primary-500/15 text-primary-700 dark:text-primary-300' },
  { key: 'failed', label: 'awx_track_stat_failed', icon: 'ri-error-warning-line', tone: 'bg-accent-100 text-accent-900' },
];

export default function AwxJobsSummary({ stats }: { stats: AwxJobsStats }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((card) => (
        <div key={card.key} className="rounded-xl bg-background-50 border border-background-200 p-3.5 flex items-center gap-3 min-w-0">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${card.tone}`}>
            <i className={`${card.icon} ${card.key === 'active' && stats.active > 0 ? 'animate-spin' : ''}`} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500 truncate">{t(card.label)}</p>
            <p className="font-heading text-xl font-bold text-foreground-950 tabular-nums leading-tight">{stats[card.key]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}