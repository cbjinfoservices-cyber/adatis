import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import ConnectorCard from '@/pages/admin/connectors/components/ConnectorCard';
import ConnectorDetail from '@/pages/admin/connectors/components/ConnectorDetail';
import AddConnectorModal, { type AdapterOption } from '@/pages/admin/connectors/components/AddConnectorModal';
import DeleteConnectorModal from '@/pages/admin/connectors/components/DeleteConnectorModal';
import ImportConnectorsModal from '@/pages/admin/connectors/components/ImportConnectorsModal';
import AdminTabs from '@/pages/admin/components/AdminTabs';
import ReadOnlyNotice from '@/components/base/ReadOnlyNotice';
import useReadOnly from '@/hooks/useReadOnly';
import { api } from '@/utils/api';
import { loadStore, reloadStore, useStore } from '@/utils/store';
import {
  CONNECTOR_SORTS, HEALTH_FILTERS, configBundleFileName, configEntryMatches, configSelectionFileName, downloadJson,
  matchesHealthFilter, matchesSearch, needsRetest, publishedCount, sortConnectors, toConfigBundle,
  type Connector, type ConnectorConfigEntry, type ConnectorSort, type ConnectorTestEntry,
  type HealthFilter, type ImportMatchStrategy,
} from '@/utils/connectors';

const isHealthFilter = (value: string | null): value is HealthFilter =>
  !!value && (HEALTH_FILTERS as string[]).includes(value);

export default function ConnectorsPage() {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { connectors: items, adapters, batchTests, status, error, failedResources } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [retestOnly, setRetestOnly] = useState<boolean>(() => searchParams.get('retest') === '1');
  const [pendingDelete, setPendingDelete] = useState<Connector | null>(null);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(() => {
    const raw = searchParams.get('health');
    return isHealthFilter(raw) ? raw : 'all';
  });
  const [sortBy, setSortBy] = useState<ConnectorSort>('recent_test');
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const autoTestRef = useRef(false);

  useEffect(() => {
    loadStore();
  }, []);

  const notify = (message: string) => setToast({ id: Date.now(), message });
  const notifyFailure = () => setToast({ id: Date.now(), message: t('data_error_title') });

  useEffect(() => {
    const raw = searchParams.get('health');
    setHealthFilter(isHealthFilter(raw) ? raw : 'all');
    setRetestOnly(searchParams.get('retest') === '1');
  }, [searchParams]);

  const toggleRetestOnly = () => {
    const next = !retestOnly;
    setRetestOnly(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set('retest', '1');
    else params.delete('retest');
    const query = params.toString();
    navigate({ search: query ? `?${query}` : '' }, { replace: true });
  };

  const resetFilters = () => {
    setSearch('');
    setRetestOnly(false);
    setHealthFilter('all');
    navigate({ search: '' }, { replace: true });
  };

  const changeFilter = (next: HealthFilter) => {
    setHealthFilter(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('health');
    else params.set('health', next);
    const query = params.toString();
    navigate({ search: query ? `?${query}` : '' }, { replace: true });
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = items.find((c) => c.id === selectedId) || items[0] || null;

  const totals = useMemo(() => ({
    connected: items.filter((c) => c.health !== 'pending').length,
    healthy: items.filter((c) => c.health === 'healthy').length,
    catalog: items.reduce((acc, c) => acc + c.catalog.length, 0),
    published: items.reduce((acc, c) => acc + publishedCount(c), 0),
    jobs: items.reduce((acc, c) => acc + c.jobs24h, 0),
  }), [items]);

  const testConnector = async (connector: Connector) => {
    setTestingId(connector.id);
    try {
      if (connector.configured === false) {
        await api.post(`/connectors/${connector.id}/test`, {
          ok: false, latency: 0, error: '401 Unauthorized - missing access token',
        });
        await reloadStore();
        notify(t('admin_test_blocked', { name: connector.name }));
        return;
      }
      const latency = 42 + ((connector.latencyMs * 7) % 61);
      await api.post(`/connectors/${connector.id}/test`, { ok: true, latency });
      await reloadStore();
      notify(t('admin_test_ok', { name: connector.name, ms: latency }));
    } catch {
      notifyFailure();
    } finally {
      setTestingId(null);
    }
  };

  const testAllRetest = async () => {
    if (items.filter(needsRetest).length === 0) {
      notify(t('admin_retest_all_none'));
      return;
    }
    setTestingAll(true);
    try {
      const summary = await api.post<{
        skipped?: boolean; total?: number; ok?: number; failed?: number;
      }>('/connectors/batch-test');
      await reloadStore();
      if (summary?.skipped) {
        notify(t('admin_retest_all_none'));
      } else {
        notify(t('admin_retest_all_done', { ok: summary?.ok ?? 0, failed: summary?.failed ?? 0 }));
        if (retestOnly && (summary?.failed ?? 0) === 0) {
          setRetestOnly(false);
          const params = new URLSearchParams(searchParams);
          params.delete('retest');
          const query = params.toString();
          navigate({ search: query ? `?${query}` : '' }, { replace: true });
        }
      }
    } catch {
      notifyFailure();
    } finally {
      setTestingAll(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('testall') !== '1') {
      autoTestRef.current = false;
      return;
    }
    if (autoTestRef.current) return;
    autoTestRef.current = true;
    const params = new URLSearchParams(searchParams);
    params.delete('testall');
    const query = params.toString();
    navigate({ search: query ? `?${query}` : '' }, { replace: true });
    testAllRetest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const syncConnector = async (connector: Connector) => {
    setSyncingId(connector.id);
    try {
      await api.post(`/connectors/${connector.id}/sync`);
      await reloadStore();
      notify(t('admin_sync_ok', { name: connector.name, count: connector.catalog.length }));
    } catch {
      notifyFailure();
    } finally {
      setSyncingId(null);
    }
  };

  const syncAll = async () => {
    const eligible = items.filter((c) => c.health !== 'pending');
    if (eligible.length === 0) {
      notify(t('admin_sync_blocked', { name: items[0]?.name || '' }));
      return;
    }
    setSyncingAll(true);
    try {
      for (const connector of eligible) {
        await api.post(`/connectors/${connector.id}/sync`);
      }
      await reloadStore();
      notify(t('admin_sync_all_ok', { count: eligible.length }));
    } catch {
      notifyFailure();
    } finally {
      setSyncingAll(false);
    }
  };

  const toggleMap = async (itemId: string) => {
    if (!selected) return;
    const target = selected.catalog.find((item) => item.id === itemId);
    if (!target) return;
    try {
      await api.patch(`/connectors/${selected.id}/catalog/${itemId}`, {
        status: target.status === 'mapped' ? 'ignored' : 'mapped',
      });
      await reloadStore();
    } catch {
      notifyFailure();
    }
  };

  const patchConnector = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.patch(`/connectors/${id}`, body);
      await reloadStore();
      return true;
    } catch {
      notifyFailure();
      return false;
    }
  };

  const updateEndpoint = (id: string, endpoint: string) => {
    void patchConnector(id, { endpoint });
  };

  const updateNotes = (id: string, notes: string) => {
    void patchConnector(id, { notes });
  };

  const handleEndpointTested = async (id: string, endpoint: string, result: ConnectorTestEntry) => {
    try {
      await api.patch(`/connectors/${id}`, { endpoint });
      await api.post(`/connectors/${id}/test`, { ok: result.ok, latency: result.latency, error: result.error });
      await reloadStore();
    } catch {
      notifyFailure();
    }
  };

  const addAdapter = async (adapter: AdapterOption) => {
    try {
      const created = await api.post<Connector>('/connectors', {
        kind: adapter.kind,
        name: adapter.name,
        endpoint: '',
        notes: '',
        configured: false,
      });
      await reloadStore();
      setSelectedId(created.id);
      setModalOpen(false);
      notify(t('admin_added', { name: adapter.name }));
    } catch {
      notifyFailure();
    }
  };

  const renameConnector = async (id: string, name: string) => {
    const ok = await patchConnector(id, { name });
    if (ok) notify(t('admin_rename_saved', { name }));
  };

  const duplicateConnector = async (connector: Connector) => {
    try {
      const created = await api.post<Connector>('/connectors', {
        kind: connector.kind,
        name: t('admin_copy_suffix', { name: connector.name }),
        endpoint: connector.endpoint === '—' ? '' : connector.endpoint,
        endpointDefault: connector.endpointDefault === '—' ? '' : connector.endpointDefault,
        authMode: connector.authMode,
        version: connector.version,
        notes: connector.notes || '',
        scope: connector.scope,
        capabilities: connector.capabilities,
        configured: false,
      });
      await reloadStore();
      setSelectedId(created.id);
      notify(t('admin_duplicate_done', { name: connector.name }));
    } catch {
      notifyFailure();
    }
  };

  const exportConfig = () => {
    const file = configBundleFileName();
    downloadJson(file, JSON.stringify(toConfigBundle(items), null, 2));
    notify(t('admin_config_export_done', { file }));
  };

  const importConfig = async (entries: ConnectorConfigEntry[], strategy: ImportMatchStrategy = 'name') => {
    try {
      for (const entry of entries) {
        const match = configEntryMatches(items, entry, strategy);
        if (match) {
          await api.patch(`/connectors/${match.id}`, {
            name: entry.name, endpoint: entry.endpoint, notes: entry.notes,
          });
        } else {
          await api.post('/connectors', {
            kind: entry.kind,
            name: entry.name,
            endpoint: entry.endpoint === '—' ? '' : entry.endpoint,
            endpointDefault: entry.endpointDefault === '—' ? '' : entry.endpointDefault,
            authMode: entry.authMode,
            notes: entry.notes,
            scope: entry.scope,
            capabilities: entry.capabilities,
            configured: entry.configured,
          });
        }
      }
      await reloadStore();
      setImportOpen(false);
      setSearch('');
      if (healthFilter !== 'all' || retestOnly) resetFilters();
      notify(t('admin_import_done', { count: entries.length }));
    } catch {
      notifyFailure();
    }
  };

  const deleteConnector = async (connector: Connector) => {
    try {
      await api.delete(`/connectors/${connector.id}`);
      await reloadStore();
      setPendingDelete(null);
      setSelectedId(null);
      notify(t('admin_delete_done', { name: connector.name }));
    } catch {
      notifyFailure();
    }
  };

  const healthCounts = useMemo(() => ({
    all: items.length,
    healthy: items.filter((c) => matchesHealthFilter(c.health, 'healthy')).length,
    degraded: items.filter((c) => matchesHealthFilter(c.health, 'degraded')).length,
    pending: items.filter((c) => matchesHealthFilter(c.health, 'pending')).length,
  }), [items]);

  const retestCount = useMemo(() => items.filter(needsRetest).length, [items]);

  const visibleItems = useMemo(
    () => sortConnectors(
      items.filter((c) => matchesHealthFilter(c.health, healthFilter)
        && (!retestOnly || needsRetest(c))
        && matchesSearch(c, search)),
      sortBy,
    ),
    [items, healthFilter, sortBy, search, retestOnly],
  );

  const filtersActive = search.trim() !== '' || retestOnly || healthFilter !== 'all';

  const exportSelection = () => {
    if (visibleItems.length === 0) return;
    const file = configSelectionFileName();
    downloadJson(file, JSON.stringify(toConfigBundle(visibleItems), null, 2));
    notify(t('admin_config_export_selection_done', { file, count: visibleItems.length }));
  };

  useEffect(() => {
    if (visibleItems.length === 0) return;
    if (!visibleItems.some((c) => c.id === selectedId)) {
      setSelectedId(visibleItems[0].id);
    }
  }, [visibleItems, selectedId]);

  const kpis = [
    { key: 'connected', label: t('admin_kpi_connected'), value: totals.connected, icon: 'ri-plug-line', tone: 'bg-background-200 text-foreground-800' },
    { key: 'healthy', label: t('admin_kpi_healthy'), value: totals.healthy, icon: 'ri-heart-pulse-line', tone: 'bg-primary-100 text-primary-700 dark:text-primary-900' },
    { key: 'catalog', label: t('admin_kpi_catalog'), value: totals.catalog, icon: 'ri-stack-line', tone: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900' },
    { key: 'jobs', label: t('admin_kpi_jobs'), value: totals.jobs, icon: 'ri-play-circle-line', tone: 'bg-accent-100 text-accent-900' },
  ];

  const failed = failedResources.includes('connectors');
  const detailConnector = selected
    ? (visibleItems.some((c) => c.id === selected.id) ? selected : (visibleItems[0] || null))
    : null;

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('admin_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('admin_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportSelection}
              disabled={!filtersActive || visibleItems.length === 0}
              title={t('admin_config_export_selection_hint')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-filter-3-line" />{t('admin_config_export_selection')}
              {filtersActive && visibleItems.length > 0 && (
                <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-800 dark:text-primary-900">{visibleItems.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={exportConfig}
              disabled={items.length === 0}
              title={t('admin_config_export')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-download-2-line" />{t('admin_config_export')}
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              disabled={readOnly}
              title={t('admin_config_import')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100"
            >
              <i className="ri-upload-2-line" />{t('admin_config_import')}
            </button>
            <button
              type="button"
              onClick={syncAll}
              disabled={syncingAll || readOnly}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={syncingAll ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
              {syncingAll ? t('admin_syncing') : t('admin_sync_all')}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
            >
              <i className="ri-add-line" />{t('admin_add')}
            </button>
          </div>
        </header>

        <AdminTabs />

        <ReadOnlyNotice />

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

        {failed ? (
          <ErrorBlock message={error} onRetry={() => reloadStore()} />
        ) : status === 'loading' && items.length === 0 ? (
          <LoadingBlock />
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2.5">
                <h2 className="font-heading font-semibold text-foreground-950">{t('admin_connectors_list')}</h2>
                <span className="font-label text-[11px] text-foreground-500">
                  {totals.published}/{totals.catalog} {t('admin_map_mapped')}
                </span>
                {search.trim() && (
                  <span className="font-label text-[11px] px-2 py-0.5 rounded-md bg-primary-100 text-primary-800 dark:text-primary-900 whitespace-nowrap">
                    {t('admin_search_results', { count: visibleItems.length })}
                  </span>
                )}
                <div className="relative w-full sm:w-auto sm:ms-auto sm:min-w-[280px]">
                  <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-500">
                    <i className="ri-search-line text-sm" />
                  </span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('admin_search_placeholder')}
                    aria-label={t('admin_search_label')}
                    className="w-full box-border ps-9 pe-9 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
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
                      onClick={() => changeFilter(filter)}
                      disabled={count === 0 && filter !== 'all'}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active
                        ? 'border-primary-400 bg-primary-500/10 text-primary-800 dark:text-primary-300'
                        : 'border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100'}`}
                    >
                      <i className={filter === 'all' ? 'ri-list-check' : filter === 'healthy' ? 'ri-heart-pulse-line' : filter === 'degraded' ? 'ri-error-warning-line' : 'ri-time-line'} />
                      {t(`admin_health_filter_${filter}`)}
                      <span className={`font-label text-[10px] px-1 rounded ${active ? 'bg-primary-500/20' : 'bg-background-200 text-foreground-600'}`}>{count}</span>
                    </button>
                  );
                })}
                {healthFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => changeFilter('all')}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-foreground-600 whitespace-nowrap cursor-pointer hover:text-foreground-900"
                  >
                    <i className="ri-close-line" />{t('admin_health_filter_clear')}
                  </button>
                )}
                <span className="w-px h-5 bg-background-300 mx-0.5" aria-hidden="true" />
                <button
                  type="button"
                  aria-pressed={retestOnly}
                  onClick={toggleRetestOnly}
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
                    onClick={testAllRetest}
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
                      onChange={(event) => setSortBy(event.target.value as ConnectorSort)}
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

              {items.length === 0 ? (
                <section className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center">
                  <span className="w-12 h-12 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
                    <i className="ri-plug-line text-xl" />
                  </span>
                  <h2 className="mt-2.5 font-heading font-semibold text-foreground-950">{t('admin_empty_title')}</h2>
                  <p className="mt-1 text-sm text-foreground-600 max-w-md mx-auto">{t('admin_empty_hint')}</p>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
                  >
                    <i className="ri-add-line" />{t('admin_add')}
                  </button>
                </section>
              ) : visibleItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center">
                  <span className="w-11 h-11 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
                    <i className={search.trim() ? 'ri-search-line' : retestOnly ? 'ri-alert-line' : 'ri-filter-off-line'} />
                  </span>
                  <p className="mt-2 text-sm text-foreground-600">
                    {search.trim()
                      ? t('admin_search_empty')
                      : retestOnly
                        ? t('admin_retest_filter_empty')
                        : t('admin_health_filter_empty')}
                  </p>
                  {(search.trim() || retestOnly) && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100"
                    >
                      <i className="ri-close-line" />{t('admin_health_filter_clear')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4">
                  {visibleItems.map((connector) => (
                    <ConnectorCard
                      key={connector.id}
                      connector={connector}
                      active={selected?.id === connector.id}
                      testing={testingId === connector.id}
                      syncing={syncingId === connector.id}
                      onSelect={() => setSelectedId(connector.id)}
                      onTest={() => testConnector(connector)}
                      onSync={() => syncConnector(connector)}
                      onDuplicate={() => duplicateConnector(connector)}
                      onDelete={() => setPendingDelete(connector)}
                    />
                  ))}
                </div>
              )}
            </div>

            {detailConnector ? (
              <ConnectorDetail
                key={detailConnector.id}
                connector={detailConnector}
                retestCount={retestCount}
                testingAll={testingAll}
                batchHistory={batchTests}
                onTestAllRetest={testAllRetest}
                onToggleMap={toggleMap}
                onUpdateEndpoint={(endpoint) => updateEndpoint(detailConnector.id, endpoint)}
                onEndpointTested={(endpoint, result) => handleEndpointTested(detailConnector.id, endpoint, result)}
                onRename={(name) => renameConnector(detailConnector.id, name)}
                onNotes={(notes) => updateNotes(detailConnector.id, notes)}
                onDuplicate={() => duplicateConnector(detailConnector)}
                onNotify={notify}
                onDelete={() => setPendingDelete(detailConnector)}
              />
            ) : (
              <section className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center">
                <span className="w-12 h-12 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
                  <i className="ri-plug-line text-xl" />
                </span>
                <h2 className="mt-2.5 font-heading font-semibold text-foreground-950">{t('admin_empty_title')}</h2>
                <p className="mt-1 text-sm text-foreground-600 max-w-md mx-auto">{t('admin_empty_hint')}</p>
              </section>
            )}
          </>
        )}
      </div>

      <DeleteConnectorModal
        connector={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={deleteConnector}
      />

      <ImportConnectorsModal
        open={importOpen}
        existing={items}
        onClose={() => setImportOpen(false)}
        onImport={importConfig}
        onNotify={notify}
      />

      <AddConnectorModal
        open={modalOpen}
        adapters={adapters as AdapterOption[]}
        connectedKinds={items.map((c) => c.kind)}
        onClose={() => setModalOpen(false)}
        onAdd={addAdapter}
      />

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 md:right-8 z-50 max-w-sm p-3.5 rounded-xl bg-foreground-950 text-background-50 shadow-lg flex items-start gap-2.5"
        >
          <span className="w-5 h-5 flex items-center justify-center text-primary-300 shrink-0"><i className="ri-information-line" /></span>
          <p className="text-sm">{toast.message}</p>
          <button type="button" onClick={() => setToast(null)} aria-label={t('admin_close')} className="ml-1 w-5 h-5 flex items-center justify-center shrink-0 text-background-300 hover:text-background-50 cursor-pointer">
            <i className="ri-close-line" />
          </button>
        </div>
      )}
    </AppShell>
  );
}