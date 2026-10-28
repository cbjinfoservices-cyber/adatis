import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import AdminTabs from '@/pages/admin/components/AdminTabs';
import ReadOnlyNotice from '@/components/base/ReadOnlyNotice';
import useReadOnly from '@/hooks/useReadOnly';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import ServiceTemplateRow from '@/pages/admin/services/components/ServiceTemplateRow';
import {
  fetchAdminServices, fetchAwxTemplates,
  type AdminServiceItem, type AwxTemplateCatalog, type AwxTemplateKind,
} from '@/utils/awxAdmin';
import Toast from '@/components/base/Toast';
import useToast from '@/hooks/useToast';

type Filter = 'all' | AwxTemplateKind;

const FILTERS: Filter[] = ['all', 'job', 'workflow', 'none'];

export default function AdminServicesPage() {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const [items, setItems] = useState<AdminServiceItem[]>([]);
  const [catalog, setCatalog] = useState<AwxTemplateCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { toast, notify, dismiss } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [services, templates] = await Promise.all([
        fetchAdminServices(),
        fetchAwxTemplates(),
      ]);
      setItems(services.items);
      setCatalog(templates);
      setError(null);
    } catch {
      setError(t('data_error_title'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => ({
    total: items.length,
    job: items.filter((item) => item.kind === 'job').length,
    workflow: items.filter((item) => item.kind === 'workflow').length,
    none: items.filter((item) => item.kind === 'none').length,
  }), [items]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (!needle) return true;
      return `${item.id} ${item.name.fr} ${item.name.en} ${item.templateName}`
        .toLowerCase()
        .includes(needle);
    });
  }, [items, filter, search]);

  const kpis = [
    { key: 'total', label: t('svc_admin_kpi_total'), value: counts.total, icon: 'ri-stack-line', tone: 'bg-background-200 text-foreground-800' },
    { key: 'job', label: t('svc_admin_kpi_job'), value: counts.job, icon: 'ri-play-circle-line', tone: 'bg-primary-100 text-primary-700 dark:text-primary-900' },
    { key: 'workflow', label: t('svc_admin_kpi_workflow'), value: counts.workflow, icon: 'ri-git-branch-line', tone: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900' },
    { key: 'none', label: t('svc_admin_kpi_none'), value: counts.none, icon: 'ri-forbid-line', tone: 'bg-accent-100 text-accent-900' },
  ];

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('svc_admin_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('svc_admin_subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => { void load(); }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed self-start lg:self-auto"
          >
            <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} aria-hidden="true" />
            {loading ? t('sys_refreshing') : t('sys_refresh')}
          </button>
        </header>

        <AdminTabs />

        <ReadOnlyNotice />

        {catalog && !catalog.available && (
          <div className="rounded-xl border border-accent-300 bg-accent-100 px-4 py-3 flex items-start gap-2.5">
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-accent-900">
              <i className="ri-shield-keyhole-line" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent-900">{t('svc_admin_unavailable')}</p>
              <p className="text-xs text-accent-900/85 leading-relaxed">
                {catalog.reason === 'awx_unreachable' ? t('svc_admin_unreachable_hint') : t('svc_admin_unavailable_hint')}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.key} className="p-4 rounded-xl bg-background-50 border border-background-200">
              <div className="flex items-start justify-between gap-2">
                <span className="font-label text-[11px] uppercase tracking-wider text-foreground-500">{kpi.label}</span>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${kpi.tone}`}>
                  <i className={kpi.icon} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 font-heading text-2xl md:text-3xl font-bold text-foreground-950">{kpi.value}</p>
            </div>
          ))}
        </div>

        <section className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <h2 className="font-heading font-semibold text-foreground-950">{t('svc_admin_list')}</h2>
            <div className="relative w-full lg:ms-auto lg:w-[300px]">
              <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-500">
                <i className="ri-search-line text-sm" aria-hidden="true" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('svc_admin_search')}
                aria-label={t('svc_admin_search')}
                className="w-full box-border ps-9 pe-3 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
              />
            </div>
          </div>

          <div role="group" aria-label={t('svc_admin_kind_label')} className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((value) => {
              const active = filter === value;
              const count = value === 'all' ? counts.total : counts[value];
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(value)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${active
                    ? 'border-primary-400 bg-primary-500/10 text-primary-800 dark:text-primary-300'
                    : 'border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100'}`}
                >
                  {value === 'all' ? t('filter_all') : t(`svc_admin_kind_${value}`)}
                  <span className={`font-label text-[10px] px-1 rounded ${active ? 'bg-primary-500/20' : 'bg-background-200 text-foreground-600'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {loading && items.length === 0 ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock message={error} onRetry={() => { void load(); }} />
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-background-300 bg-background-50 p-10 text-center">
              <span className="w-12 h-12 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
                <i className={search.trim() ? 'ri-search-line text-xl' : 'ri-stack-line text-xl'} aria-hidden="true" />
              </span>
              <h3 className="mt-2.5 font-heading font-semibold text-foreground-950">
                {items.length === 0 ? t('svc_admin_empty') : t('svc_admin_no_match')}
              </h3>
              <p className="mt-1 text-sm text-foreground-600 max-w-md mx-auto">
                {items.length === 0 ? t('svc_admin_empty_hint') : t('svc_admin_no_match_hint')}
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {visible.map((service) => (
                <ServiceTemplateRow
                  key={`${service.id}-${service.kind}-${service.templateId ?? 'none'}`}
                  service={service}
                  catalog={catalog}
                  readOnly={readOnly}
                  onSaved={(updated) => setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))}
                  onNotify={notify}
                />
              ))}
            </ul>
          )}
        </section>

        <p className="font-label text-[11px] text-foreground-500 flex items-start gap-1.5">
          <span className="w-4 h-4 flex items-center justify-center shrink-0"><i className="ri-information-line" aria-hidden="true" /></span>
          {t('svc_admin_note')}
        </p>
      </div>

      <Toast toast={toast} onClose={dismiss} />
    </AppShell>
  );
}