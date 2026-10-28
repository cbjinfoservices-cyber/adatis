import { useTranslation } from 'react-i18next';
import { CONNECTOR_SORTS, HEALTH_FILTERS, type ConnectorSort, type HealthFilter } from '@/utils/connectors';

const HEALTH_ICON: Record<HealthFilter, string> = {
  all: 'ri-list-check',
  healthy: 'ri-heart-pulse-line',
  degraded: 'ri-error-warning-line',
  pending: 'ri-time-line',
};

interface Props {
  published: number;
  catalog: number;
  resultCount: number;
  search: string;
  onSearch: (value: string) => void;
  healthFilter: HealthFilter;
  healthCounts: Record<HealthFilter, number>;
  onHealthFilter: (filter: HealthFilter) => void;
  retestOnly: boolean;
  retestCount: number;
  onToggleRetest: () => void;
  testingAll: boolean;
  onTestAllRetest: () => void;
  sortBy: ConnectorSort;
  onSort: (sort: ConnectorSort) => void;
}

/** Titre de la liste, recherche, filtres de santé, « à retester » et tri. */
export default function ConnectorsToolbar({
  published, catalog, resultCount, search, onSearch, healthFilter, healthCounts, onHealthFilter,
  retestOnly, retestCount, onToggleRetest, testingAll, onTestAllRetest, sortBy, onSort,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <h2 className="font-heading font-semibold text-foreground-950">{t('admin_connectors_list')}</h2>
        <span className="font-label text-[11px] text-foreground-500">
          {published}/{catalog} {t('admin_map_mapped')}
        </span>
        {search.trim() && (
          <span className="font-label text-[11px] px-2 py-0.5 rounded-md bg-primary-100 text-primary-800 dark:text-primary-900 whitespace-nowrap">
            {t('admin_search_results', { count: resultCount })}
          </span>
        )}
        <div className="relative w-full sm:w-auto sm:ms-auto sm:min-w-[280px]">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-500">
            <i className="ri-search-line text-sm" />
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t('admin_search_placeholder')}
            aria-label={t('admin_search_label')}
            className="w-full box-border ps-9 pe-9 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch('')}
              aria-label={t('admin_search_clear')}
              title={t('admin_search_clear')}
              className="absolute end-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-foreground-500 cursor-pointer hover:bg-background-200 hover:text-foreground-900"
            >
              <i className="ri-close-line text-sm" />
            </button>
          )}
        </div>
      </div>
      <div
        role="group"
        aria-label={t('admin_health_filter')}
        className="flex flex-wrap items-center gap-1.5 mb-3"
      >
        {HEALTH_FILTERS.map((filter) => {
          const active = healthFilter === filter;
          const count = healthCounts[filter];
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={active}
              onClick={() => onHealthFilter(filter)}
              disabled={count === 0 && filter !== 'all'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active
                ? 'border-primary-400 bg-primary-500/10 text-primary-800 dark:text-primary-300'
                : 'border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100'}`}
            >
              <i className={HEALTH_ICON[filter]} />
              {t(`admin_health_filter_${filter}`)}
              <span className={`font-label text-[10px] px-1 rounded ${active ? 'bg-primary-500/20' : 'bg-background-200 text-foreground-600'}`}>{count}</span>
            </button>
          );
        })}
        {healthFilter !== 'all' && (
          <button
            type="button"
            onClick={() => onHealthFilter('all')}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-foreground-600 whitespace-nowrap cursor-pointer hover:text-foreground-900"
          >
            <i className="ri-close-line" />{t('admin_health_filter_clear')}
          </button>
        )}
        <span className="w-px h-5 bg-background-300 mx-0.5" aria-hidden="true" />
        <button
          type="button"
          aria-pressed={retestOnly}
          onClick={onToggleRetest}
          disabled={retestCount === 0 && !retestOnly}
          title={t('admin_retest_filter_hint')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${retestOnly
            ? 'border-accent-400 bg-accent-100 text-accent-900'
            : 'border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100'}`}
        >
          <i className="ri-alert-line" />
          {t('admin_retest_filter')}
          <span className={`font-label text-[10px] px-1 rounded ${retestOnly ? 'bg-accent-500/20' : 'bg-background-200 text-foreground-600'}`}>{retestCount}</span>
        </button>
        {retestCount > 0 && (
          <button
            type="button"
            onClick={onTestAllRetest}
            disabled={testingAll}
            title={t('admin_retest_all')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-accent-400 bg-accent-100 text-accent-900 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors hover:bg-accent-100/70 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className={testingAll ? 'ri-loader-4-line animate-spin' : 'ri-play-circle-line'} />
            {testingAll ? t('admin_retest_all_running') : t('admin_retest_all')}
            {!testingAll && (
              <span className="font-label text-[10px] px-1 rounded bg-accent-500/20">{retestCount}</span>
            )}
          </button>
        )}
        <div className="ms-auto flex items-center gap-1.5">
          <label
            htmlFor="connector-sort"
            className="font-label text-[10px] uppercase tracking-wider text-foreground-500 whitespace-nowrap"
          >
            {t('admin_sort_label')}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-500">
              <i className="ri-sort-desc text-sm" />
            </span>
            <select
              id="connector-sort"
              value={sortBy}
              onChange={(event) => onSort(event.target.value as ConnectorSort)}
              className="appearance-none ps-8 pe-7 py-1.5 rounded-lg border border-background-300 bg-background-50 text-xs font-medium text-foreground-800 cursor-pointer hover:bg-background-100"
            >
              {CONNECTOR_SORTS.map((sort) => (
                <option key={sort} value={sort}>{t(`admin_sort_${sort}`)}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-500">
              <i className="ri-arrow-down-s-line" />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
