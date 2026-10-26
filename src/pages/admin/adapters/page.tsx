import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import AdminTabs from '@/pages/admin/components/AdminTabs';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import AdapterCard from '@/pages/admin/adapters/components/AdapterCard';
import AdapterFormModal from '@/pages/admin/adapters/components/AdapterFormModal';
import DeleteAdapterModal from '@/pages/admin/adapters/components/DeleteAdapterModal';
import type { AdapterDraft } from '@/pages/admin/adapters/components/adapterDraft';
import { api, ApiError } from '@/utils/api';
import { loadStore, patchStore, reloadStore, useStore, type AdapterItem } from '@/utils/store';
import { downloadCsv } from '@/utils/connectors';
import { adaptersCsvFileName, adaptersToCsv } from '@/utils/adaptersCsv';

const sortAdapters = (items: AdapterItem[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

export default function AdaptersPage() {
  const { t } = useTranslation();
  const { adapters, connectors, status, error, failedResources } = useStore();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdapterItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdapterItem | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    loadStore();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string) => setToast({ id: Date.now(), message });

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    connectors.forEach((connector) => {
      map.set(connector.kind, (map.get(connector.kind) || 0) + 1);
    });
    return map;
  }, [connectors]);

  const countOf = (kind: string) => usage.get(kind) || 0;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = sortAdapters(adapters);
    if (!needle) return list;
    return list.filter((adapter) => [
      adapter.name,
      adapter.kind,
      adapter.description?.fr || '',
      adapter.description?.en || '',
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [adapters, search]);

  const totals = useMemo(() => ({
    total: adapters.length,
    used: adapters.filter((adapter) => (usage.get(adapter.kind) || 0) > 0).length,
    connectors: connectors.length,
  }), [adapters, connectors, usage]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (adapter: AdapterItem) => {
    setEditing(adapter);
    setFormOpen(true);
  };

  const submitForm = async (values: AdapterDraft): Promise<string | null> => {
    if (editing) {
      try {
        const updated = await api.patch<AdapterItem>(`/adapters/${editing.kind}`, {
          name: values.name,
          icon: values.icon,
          descriptionFr: values.descriptionFr,
          descriptionEn: values.descriptionEn,
        });
        patchStore({
          adapters: sortAdapters(adapters.map((item) => (item.kind === updated.kind
            ? { ...item, ...updated }
            : item))),
        });
        notify(t('adapt_saved', { name: updated.name }));
        return null;
      } catch {
        return t('adapt_error');
      }
    }

    try {
      const created = await api.post<AdapterItem>('/adapters', values);
      patchStore({ adapters: sortAdapters([...adapters, created]) });
      notify(t('adapt_created', { name: created.name }));
      return null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return t('adapt_exists');
      return t('adapt_error');
    }
  };

  const deleteAdapter = async (adapter: AdapterItem) => {
    try {
      await api.delete(`/adapters/${adapter.kind}`);
      patchStore({ adapters: adapters.filter((item) => item.kind !== adapter.kind) });
      setPendingDelete(null);
      notify(t('adapt_delete_done', { name: adapter.name }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        notify(t('adapt_delete_blocked', { count: countOf(adapter.kind) }));
      } else {
        notify(t('adapt_error'));
      }
    }
  };

  const exportCsv = () => {
    if (adapters.length === 0) {
      notify(t('adapt_export_empty'));
      return;
    }
    const file = adaptersCsvFileName();
    downloadCsv(file, adaptersToCsv(sortAdapters(adapters), countOf, {
      name: t('adapt_name'),
      kind: t('adapt_kind'),
      connectors: t('adapt_kpi_connectors'),
      descFr: t('adapt_desc_fr'),
      descEn: t('adapt_desc_en'),
    }));
    notify(t('adapt_export_done', { file }));
  };

  const failed = failedResources.includes('adapters') || status === 'error';
  const loading = (status === 'loading' || status === 'idle') && adapters.length === 0;

  const kpis = [
    { key: 'total', label: t('adapt_kpi_total'), value: totals.total, icon: 'ri-plug-2-line', tone: 'bg-background-200 text-foreground-800' },
    { key: 'used', label: t('adapt_kpi_used'), value: totals.used, icon: 'ri-links-line', tone: 'bg-primary-100 text-primary-700 dark:text-primary-900' },
    { key: 'connectors', label: t('adapt_kpi_connectors'), value: totals.connectors, icon: 'ri-plug-line', tone: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900' },
  ];

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('adapt_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('adapt_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <button
              type="button"
              onClick={exportCsv}
              disabled={adapters.length === 0 || failed}
              title={t('adapt_export')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-download-2-line" />{t('adapt_export')}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
            >
              <i className="ri-add-line" />{t('adapt_new')}
            </button>
          </div>
        </header>

        <AdminTabs />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
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
        ) : loading ? (
          <LoadingBlock />
        ) : (
          <section>
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <h2 className="font-heading font-semibold text-foreground-950">{t('adapt_list')}</h2>
              <span className="font-label text-[11px] text-foreground-500">{t('adapt_list_hint')}</span>
              <div className="relative w-full sm:w-auto sm:ms-auto sm:min-w-[280px]">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-500">
                  <i className="ri-search-line text-sm" />
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('adapt_search')}
                  aria-label={t('adapt_search')}
                  className="w-full box-border ps-9 pe-9 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('admin_search_clear')}
                    className="absolute end-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-foreground-500 cursor-pointer hover:bg-background-200 hover:text-foreground-900"
                  >
                    <i className="ri-close-line text-sm" />
                  </button>
                )}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center">
                <span className="w-12 h-12 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
                  <i className={search.trim() ? 'ri-search-line text-xl' : 'ri-plug-2-line text-xl'} />
                </span>
                <h2 className="mt-2.5 font-heading font-semibold text-foreground-950">
                  {search.trim() ? t('adapt_search_empty') : t('adapt_empty_title')}
                </h2>
                <p className="mt-1 text-sm text-foreground-600 max-w-md mx-auto">
                  {search.trim() ? t('adapt_search_empty_hint') : t('adapt_empty_hint')}
                </p>
                {!search.trim() && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
                  >
                    <i className="ri-add-line" />{t('adapt_new')}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4">
                {visible.map((adapter) => (
                  <AdapterCard
                    key={adapter.kind}
                    adapter={adapter}
                    connectors={countOf(adapter.kind)}
                    onEdit={() => openEdit(adapter)}
                    onDelete={() => setPendingDelete(adapter)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <AdapterFormModal
        open={formOpen}
        adapter={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={submitForm}
      />

      <DeleteAdapterModal
        adapter={pendingDelete}
        connectors={pendingDelete ? countOf(pendingDelete.kind) : 0}
        onClose={() => setPendingDelete(null)}
        onConfirm={deleteAdapter}
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
          <button type="button" onClick={() => setToast(null)} aria-label={t('adapt_close')} className="ml-1 w-5 h-5 flex items-center justify-center shrink-0 text-background-300 hover:text-background-50 cursor-pointer">
            <i className="ri-close-line" />
          </button>
        </div>
      )}
    </AppShell>
  );
}