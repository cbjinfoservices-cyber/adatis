import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import AwxJobsSummary from '@/pages/awx/components/AwxJobsSummary';
import AwxJobsTable from '@/pages/awx/components/AwxJobsTable';
import {
  AWX_FILTER_STATUSES, fetchAwxJobs,
  type AwxJobRow, type AwxJobsStats,
} from '@/utils/awxJobs';

const POLL_MS = 10000;

const EMPTY_STATS: AwxJobsStats = {
  total: 0, active: 0, success: 0, failed: 0, notWired: 0,
};

export default function AwxTrackingPage() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<AwxJobRow[]>([]);
  const [stats, setStats] = useState<AwxJobsStats>(EMPTY_STATS);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('all');
  const [user, setUser] = useState('');
  const [search, setSearch] = useState('');
  const [auto, setAuto] = useState(() => localStorage.getItem('asp-awx-auto') !== 'off');

  useEffect(() => {
    localStorage.setItem('asp-awx-auto', auto ? 'on' : 'off');
  }, [auto]);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const payload = await fetchAwxJobs({ refresh: true });
      setItems(payload.items);
      setStats(payload.stats);
      setFetchedAt(payload.fetchedAt);
      setError(null);
    } catch (err) {
      if (!silent) {
        setItems([]);
        setStats(EMPTY_STATS);
        setError(err instanceof Error ? err.message : null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const timer = window.setInterval(() => { void load(true); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [auto, load]);

  const users = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.user) set.add(item.user);
      if (item.awx?.launchedBy) set.add(item.awx.launchedBy);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== 'all' && item.portalStatus !== status) return false;
      if (user && item.user !== user && item.awx?.launchedBy !== user) return false;
      if (!needle) return true;
      return `${item.id} ${item.service.fr} ${item.service.en} ${item.user} ${item.tenant} ${item.awx?.templateName || ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [items, status, user, search]);

  const updatedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('awx_track_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('awx_track_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setAuto((value) => !value)}
              aria-pressed={auto}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors ${auto ? 'border-primary-400 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100'}`}
            >
              <i className={auto ? 'ri-live-line' : 'ri-pause-circle-line'} aria-hidden="true" />
              {auto ? t('awx_track_auto_on') : t('awx_track_auto_off')}
            </button>
            <button
              type="button"
              onClick={() => { void load(true); }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={refreshing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} aria-hidden="true" />
              {refreshing ? t('awx_track_refreshing') : t('sys_refresh')}
            </button>
          </div>
        </header>

        {error ? (
          <ErrorBlock message={error} onRetry={() => { void load(); }} />
        ) : (
          <>
            <AwxJobsSummary stats={stats} />

            <div className="rounded-xl bg-background-50 border border-background-200 p-3 md:p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {AWX_FILTER_STATUSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatus(value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border whitespace-nowrap cursor-pointer transition-colors ${status === value ? 'bg-foreground-950 text-background-50 border-foreground-950 font-semibold' : 'bg-background-50 border-background-300 text-foreground-700 hover:border-foreground-400'}`}
                  >
                    {value === 'all' ? t('filter_all') : t(`status_${value}`)}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_240px_auto] gap-2 items-center">
                <div className="relative min-w-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-foreground-500">
                    <i className="ri-search-line" aria-hidden="true" />
                  </span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('awx_track_search')}
                    aria-label={t('awx_track_search')}
                    className="w-full box-border pl-9 pr-3 py-2 rounded-lg bg-background-100 border border-background-300 text-sm text-foreground-900 placeholder:text-foreground-400 outline-none focus:ring-2 focus:ring-primary-400/40"
                  />
                </div>
                <select
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                  aria-label={t('awx_track_filter_user')}
                  className="w-full box-border min-w-0 px-3 py-2 rounded-lg bg-background-100 border border-background-300 text-sm text-foreground-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                >
                  <option value="">{t('awx_track_all_users')}</option>
                  {users.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <span className="font-label text-[11px] text-foreground-500 whitespace-nowrap sm:text-end">
                  {updatedLabel ? t('awx_track_updated', { time: updatedLabel }) : t('awx_track_waiting')}
                </span>
              </div>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : rows.length === 0 ? (
              <section className="rounded-xl border border-dashed border-background-300 bg-background-50 p-10 text-center">
                <span className="w-12 h-12 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
                  <i className="ri-git-branch-line text-xl" aria-hidden="true" />
                </span>
                <h2 className="mt-2.5 font-heading font-semibold text-foreground-950">
                  {items.length === 0 ? t('awx_track_empty_title') : t('awx_track_no_match_title')}
                </h2>
                <p className="mt-1 text-sm text-foreground-600 max-w-md mx-auto">
                  {items.length === 0 ? t('awx_track_empty_hint') : t('awx_track_no_match_hint')}
                </p>
              </section>
            ) : (
              <AwxJobsTable rows={rows} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}