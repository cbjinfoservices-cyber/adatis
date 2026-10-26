import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { tx } from '@/utils/catalog';
import { formatDuration } from '@/utils/executions';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import { loadStore, reloadStore, useStore } from '@/utils/store';

const STATUS_COLORS: Record<string, string> = {
  success: 'oklch(var(--primary-500))',
  failed: 'oklch(var(--accent-500))',
  canceled: 'oklch(var(--secondary-400))',
  running: 'oklch(var(--primary-300))',
};

function KpiCard({ label, value, delta, icon, tone }: { label: string; value: string; delta?: string; icon: string; tone: 'primary' | 'accent' | 'secondary' | 'foreground' }) {
  const toneCls = {
    primary: 'bg-primary-100 text-primary-700 dark:text-primary-900',
    accent: 'bg-accent-100 text-accent-900',
    secondary: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900',
    foreground: 'bg-background-200 text-foreground-800',
  }[tone];
  return (
    <div className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
      <div className="flex items-start justify-between gap-2">
        <span className="font-label text-[11px] uppercase tracking-wider text-foreground-500">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneCls}`}><i className={icon} /></span>
      </div>
      <p className="mt-3 font-heading text-2xl md:text-3xl font-bold text-foreground-950">{value}</p>
      {delta && <p className="mt-1 font-label text-[11px] text-primary-700 dark:text-primary-300 flex items-center gap-1"><i className="ri-arrow-up-line" />{delta}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { dashboard: k, status, error } = useStore();

  useEffect(() => { loadStore(); }, []);

  if (status === 'error') {
    return (
      <div className="px-4 md:px-10 py-8">
        <ErrorBlock message={error} onRetry={() => reloadStore()} />
      </div>
    );
  }

  if (!k) {
    return (
      <div className="px-4 md:px-10 py-8">
        <LoadingBlock />
      </div>
    );
  }

  const trend = k.trendTotal.map((v, i) => ({ day: `J-${Math.max(k.trendTotal.length - 1 - i, 0)}`, value: v }));
  const topServiceMax = k.topServices.length ? k.topServices[0].value : 1;

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 space-y-6">
      <header>
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('dash_title')}</h1>
        <p className="mt-1 text-sm text-foreground-600">{t('dash_subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4">
        <KpiCard label={t('kpi_total')} value={k.totalJobs.toLocaleString(lang.startsWith('en') ? 'en-GB' : 'fr-FR')} delta="+12,4 %" icon="ri-play-list-2-line" tone="primary" />
        <KpiCard label={t('kpi_success_rate')} value={`${k.successRate} %`} delta="+0,8 pt" icon="ri-checkbox-circle-line" tone="secondary" />
        <KpiCard label={t('kpi_failures')} value={k.failures.toLocaleString(lang.startsWith('en') ? 'en-GB' : 'fr-FR')} icon="ri-error-warning-line" tone="accent" />
        <KpiCard label={t('kpi_avg')} value={formatDuration(k.avgDurationSec, lang)} icon="ri-timer-line" tone="foreground" />
        <KpiCard label={t('kpi_availability')} value="99,97 %" delta="SLA 99,9 %" icon="ri-pulse-line" tone="primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-heading font-semibold text-foreground-950">{t('trend_title')}</h2>
            <span className="font-label text-[11px] text-foreground-500">{t('trend_sub')}</span>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(var(--primary-500))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(var(--primary-500))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(var(--background-300))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'oklch(var(--foreground-500))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'oklch(var(--foreground-500))' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'oklch(var(--background-50))', border: '1px solid oklch(var(--background-300))', borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke="oklch(var(--primary-500))" strokeWidth={2.5} fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
          <h2 className="font-heading font-semibold text-foreground-950">{t('status_title')}</h2>
          <div className="mt-2 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={k.statusDistribution} dataKey="value" nameKey="key" innerRadius={48} outerRadius={72} paddingAngle={3} stroke="none">
                  {k.statusDistribution.map((s) => <Cell key={s.key} fill={STATUS_COLORS[s.key]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'oklch(var(--background-50))', border: '1px solid oklch(var(--background-300))', borderRadius: 10, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5">
            {k.statusDistribution.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS[s.key] }} />
                <span className="text-foreground-700">{t(`status_${s.key}`)}</span>
                <span className="ml-auto font-label text-xs text-foreground-600">{s.value.toLocaleString('fr-FR')}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
          <h2 className="font-heading font-semibold text-foreground-950">{t('top_services')}</h2>
          <ul className="mt-4 space-y-3">
            {k.topServices.map((s) => {
              const max = topServiceMax;
              return (
                <li key={`${s.name.fr}-${s.value}`}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground-800 truncate">{tx(s.name, lang)}</span>
                    <span className="font-label text-xs text-foreground-600 whitespace-nowrap">{s.value.toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-background-200 overflow-hidden">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${(s.value / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
          <h2 className="font-heading font-semibold text-foreground-950">{t('top_users')}</h2>
          <ul className="mt-4 divide-y divide-background-200">
            {k.topUsers.map((u) => (
              <li key={u.name} className="flex items-center gap-3 py-2.5">
                <span className="w-9 h-9 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-label text-xs font-semibold shrink-0">{u.initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground-950 truncate">{u.name}</span>
                  <span className="block text-xs text-foreground-500 truncate">{u.role}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-label text-xs text-foreground-900">{u.jobs}</span>
                  <span className="block font-label text-[10px] text-primary-700 dark:text-primary-300">{u.rate} %</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
          <h2 className="font-heading font-semibold text-foreground-950">{t('top_tenants')}</h2>
          <ul className="mt-4 space-y-2">
            {k.topTenants.map((tn) => (
              <li key={tn.name} className="p-3 rounded-lg bg-background-100 border border-background-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground-950 truncate">{tn.name}</span>
                  <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-900 whitespace-nowrap">{tn.plan}</span>
                </div>
                <div className="mt-2 flex items-center gap-4 font-label text-[11px] text-foreground-600">
                  <span>{tn.jobs.toLocaleString('fr-FR')} {t('col_jobs').toLowerCase()}</span>
                  <span className="text-primary-700 dark:text-primary-300">{tn.rate} % {t('col_rate').toLowerCase()}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}