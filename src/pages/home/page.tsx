import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import ServiceGrid from '@/pages/home/components/ServiceGrid';
import CatalogToolbar, { type SortKey } from '@/pages/home/components/CatalogToolbar';
import HeroProjectPicker from '@/pages/home/components/HeroProjectPicker';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import { tx } from '@/utils/catalog';
import { loadStore, projectIconOf, reloadStore, useStore } from '@/utils/store';
import type { ProjectId } from '@/types/catalog';

export default function Home() {
  const { t, i18n } = useTranslation();
  const { services, projects, status, error } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [project, setProject] = useState<ProjectId | 'all'>(() => {
    const fromUrl = searchParams.get('project');
    return fromUrl && projects.some((p) => p.id === fromUrl) ? (fromUrl as ProjectId) : 'all';
  });
  const [sort, setSort] = useState<SortKey>('popular');
  const [groupByCategory, setGroupByCategory] = useState(true);
  const listRef = useRef<HTMLElement | null>(null);

  useEffect(() => { loadStore(); }, []);

  const projectCounts = useMemo(() => {
    const c: Partial<Record<ProjectId, number>> = {};
    services.forEach((s) => { c[s.project] = (c[s.project] || 0) + 1; });
    return c;
  }, [services]);

  const scoped = useMemo(
    () => (project === 'all' ? services : services.filter((s) => s.project === project)),
    [services, project],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((s) => {
      const hay = `${s.name.fr} ${s.name.en} ${s.description.fr} ${s.description.en} ${s.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scoped, query]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === 'fastest') return list.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
    if (sort === 'az') {
      return list.sort((a, b) => tx(a.name, i18n.language).localeCompare(tx(b.name, i18n.language), i18n.language, { sensitivity: 'base' }));
    }
    return list.sort((a, b) => b.popularity - a.popularity);
  }, [filtered, sort, i18n.language]);

  const selectProject = (next: ProjectId | 'all', scroll = false) => {
    setProject(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('project');
    else params.set('project', next);
    setSearchParams(params, { replace: true });
    if (scroll) {
      window.requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const filteredByProject = project !== 'all';
  const hasSearch = query.trim().length > 0;
  const hasSearchAndProject = hasSearch && filteredByProject;

  const resetFilters = () => {
    setQuery('');
    selectProject('all');
  };

  const avg = services.length
    ? Math.round(services.reduce((n, s) => n + s.estimatedMinutes, 0) / services.length)
    : 0;
  const categoryCount = useMemo(() => new Set(services.map((s) => s.category)).size, [services]);

  return (
    <AppShell>
      <section className="relative overflow-hidden bg-foreground-950 text-background-50 dark:bg-background-50 dark:text-foreground-950">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-primary-500/30 blur-3xl" />
        <div className="relative w-full px-4 md:px-10 py-6 md:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-10">
            <div className="min-w-0 flex-1">
              <p className="font-label text-[10px] uppercase tracking-[0.2em] text-accent-400">{t('catalog_eyebrow')}</p>
              <h1 className="mt-1.5 font-heading text-xl md:text-2xl lg:text-3xl font-bold max-w-2xl leading-tight">{t('catalog_title')}</h1>
              <p className="mt-1.5 text-xs md:text-sm opacity-70 max-w-xl">{t('catalog_subtitle')}</p>
            </div>
            <div className="w-full shrink-0 lg:w-[380px]">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-500"><i className="ri-search-line" /></span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('search_placeholder')}
                  aria-label={t('search_placeholder')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background-50 text-foreground-950 text-sm outline-none focus:ring-2 focus:ring-primary-400 dark:bg-background-100"
                />
              </div>
              <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                {[
                  { label: t('stat_services'), value: services.length },
                  { label: t('stat_categories'), value: categoryCount },
                  { label: t('stat_avg'), value: `${avg} ${t('minutes')}` },
                ].map((s) => (
                  <div key={s.label} className="flex items-baseline gap-1.5">
                    <dt className="font-label text-[10px] uppercase tracking-wider opacity-55">{s.label}</dt>
                    <dd className="font-heading text-sm font-bold tabular-nums">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <HeroProjectPicker active={project} counts={projectCounts} projects={projects} total={services.length} onSelect={(p) => selectProject(p, true)} />
        </div>
      </section>

      <div className="px-4 md:px-10 py-8 md:py-10 space-y-10">
        <section ref={listRef} className="scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-foreground-950">{t('all_services')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {filteredByProject && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-700 font-label text-[11px] whitespace-nowrap">
                  <i className={projectIconOf(project)} />
                  {t(`proj_${project}`)}
                  <button type="button" onClick={() => selectProject('all')} aria-label={t('project_clear')} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-primary-100 cursor-pointer">
                    <i className="ri-close-line text-xs" />
                  </button>
                </span>
              )}
              {hasSearch && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-50 border border-accent-200 text-accent-800 font-label text-[11px] whitespace-nowrap max-w-[240px]">
                  <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0"><i className="ri-search-line" /></span>
                  <span className="truncate">«&nbsp;{query.trim()}&nbsp;»</span>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label={t('search_clear')}
                    title={t('search_clear')}
                    className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full hover:bg-accent-100 cursor-pointer"
                  >
                    <i className="ri-close-line text-xs" />
                  </button>
                </span>
              )}
              {hasSearchAndProject && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-background-300 bg-background-50 text-foreground-700 font-label text-[11px] whitespace-nowrap hover:border-primary-400 hover:text-primary-700 transition-colors cursor-pointer"
                >
                  <span className="w-3.5 h-3.5 flex items-center justify-center"><i className="ri-refresh-line" /></span>
                  {t('filters_reset')}
                </button>
              )}
              <span className="font-label text-xs text-foreground-500">{sorted.length} {t('results')}</span>
            </div>
          </div>

          <CatalogToolbar
            sort={sort}
            onSort={setSort}
            grouped={groupByCategory}
            onToggleGroup={() => setGroupByCategory((v) => !v)}
            showGroupToggle={filteredByProject}
          />

          {status === 'error' && <div className="mt-6"><ErrorBlock message={error} onRetry={() => reloadStore()} /></div>}

          {status !== 'error' && (status === 'idle' || status === 'loading') && (
            <LoadingBlock />
          )}

          {status === 'ready' && sorted.length === 0 && (
            <div className="mt-10 py-16 text-center rounded-xl border border-dashed border-background-300 text-foreground-500">
              <i className="ri-search-eye-line text-3xl" />
              <p className="mt-2 text-sm">{t('no_results')}</p>
            </div>
          )}

          {status === 'ready' && sorted.length > 0 && (
            <ServiceGrid services={sorted} grouped={filteredByProject && groupByCategory} />
          )}
        </section>
      </div>
    </AppShell>
  );
}