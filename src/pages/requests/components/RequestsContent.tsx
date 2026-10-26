import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  STATUS_STYLE, businessLabel, formatDate, formatDuration,
  type ExecutionStatus, type RequestDetailData, type RequestItem,
} from '@/utils/executions';
import { tx, localeOf } from '@/utils/catalog';
import { api } from '@/utils/api';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import { loadStore, patchStore, reloadStore, useStore } from '@/utils/store';
import { exportRequestBundlePdf } from '@/utils/pdfBundle';

const TABS: (ExecutionStatus | 'all')[] = ['all', 'queued', 'running', 'success', 'failed', 'canceled'];

export default function RequestsContent() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [params] = useSearchParams();
  const { requests, status: storeStatus, error } = useStore();
  const [tab, setTab] = useState<ExecutionStatus | 'all'>('all');
  const [query, setQuery] = useState(params.get('q') || '');
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { loadStore(); }, []);

  // Jobs AWX actifs : on rafraîchit leur état réel sans recharger tout le store.
  const hasActiveAwx = requests.some((r) => Boolean(r.awx) && ['queued', 'running'].includes(r.status));

  useEffect(() => {
    if (!hasActiveAwx) return undefined;
    const timer = window.setInterval(async () => {
      try {
        await api.get('/awx/jobs?refresh=1');
        const fresh = await api.get<RequestItem[]>('/requests?limit=200');
        patchStore({ requests: fresh });
      } catch {
        /* AWX momentanément injoignable : nouvelle tentative à la passe suivante */
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [hasActiveAwx]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length };
    requests.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [requests]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (!q) return true;
      return `${r.id} ${r.service.fr} ${r.service.en} ${r.user} ${r.tenant}`.toLowerCase().includes(q);
    });
  }, [requests, tab, query]);

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected((prev) => prev.filter((id) => !rows.some((r) => r.id === id)));
      return;
    }
    setSelected((prev) => Array.from(new Set([...prev, ...rows.map((r) => r.id)])));
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const exportSelection = async () => {
    const chosen = requests.filter((r) => selected.includes(r.id));
    if (chosen.length === 0) return;
    setExporting(true);
    try {
      const details = await Promise.all(
        chosen.map((r) => api.get<RequestDetailData>(`/requests/${r.id}`).catch(() => ({ timeline: [], logs: [] } as RequestDetailData))),
      );
      const fileName = `demandes-selection-${chosen.length}.pdf`;
      exportRequestBundlePdf({
        items: chosen.map((r, index) => {
          const detail = details[index];
          const failed = r.status === 'failed' || r.status === 'canceled';
          return {
            ref: r.id,
            service: tx(r.service, lang),
            status: t(`status_${r.status}`),
            user: r.user,
            tenant: r.tenant,
            environment: r.environment,
            createdAt: formatDate(r.createdAt, lang),
            duration: formatDuration(r.durationSec, lang),
            approval: t(`approval_${r.approval}`),
            progress: r.progress,
            steps: detail.timeline.map((step) => ({
              label: t(`step_${step.key}`),
              state: t(`pdf_step_${step.status}`),
              note: tx(step.note, lang),
              tone: step.status,
            })),
            result: detail.result && r.status === 'success'
              ? {
                title: businessLabel(detail.result.type, lang.startsWith('en') ? 'en' : 'fr'),
                fields: detail.result.fields.map((f) => ({ label: tx(f.label, lang), value: f.value })),
              }
              : undefined,
            error: detail.error && failed
              ? {
                code: detail.error.code,
                severity: detail.error.severity,
                reason: tx(detail.error.reason, lang),
                solution: tx(detail.error.solution, lang),
              }
              : undefined,
          };
        }),
        labels: {
          title: t('pdf_bundle_title'),
          subtitle: t('pdf_bundle_subtitle', { count: chosen.length }),
          table: t('pdf_bundle_table'),
          details: t('pdf_bundle_details'),
          request: t('pdf_section_request'),
          result: t('pdf_section_result'),
          error: t('pdf_section_error'),
          progressTitle: t('pdf_section_progress'),
          timeline: t('pdf_section_timeline'),
          ref: t('pdf_ref'),
          service: t('pdf_service'),
          status: t('pdf_status'),
          user: t('pdf_requested_by'),
          tenant: t('pdf_tenant'),
          env: t('pdf_env'),
          duration: t('pdf_duration'),
          approval: t('pdf_approval'),
          createdAt: t('pdf_created'),
          date: t('pdf_created'),
          generated: t('pdf_generated', { date: new Date().toLocaleString(localeOf(lang)) }),
        },
        fileName,
      });
      setToast(t('pdf_bundle_ready', { file: fileName }));
      setSelected([]);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('req_title')}</h1>
          <p className="mt-1 text-sm text-foreground-600">{t('req_subtitle')}</p>
        </div>
        <div className="relative w-full sm:w-80">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-foreground-500"><i className="ri-filter-3-line" /></span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search_requests')} aria-label={t('search_requests')}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm outline-none focus:ring-2 focus:ring-primary-400/40" />
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((s) => (
          <button key={s} type="button" onClick={() => setTab(s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border whitespace-nowrap cursor-pointer transition-colors ${tab === s ? 'bg-foreground-950 text-background-50 border-foreground-950' : 'bg-background-50 border-background-200 text-foreground-700 hover:border-foreground-400'}`}>
            {s === 'all' ? t('filter_all') : t(`status_${s}`)}
            <span className="opacity-60 font-label text-[11px]">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 p-2.5 rounded-xl bg-primary-500/10 border border-primary-300">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-background-50 font-label text-[11px] font-semibold text-primary-800 dark:text-primary-300 whitespace-nowrap">
            <i className="ri-checkbox-multiple-line" />{t('req_selection_count', { count: selected.length })}
          </span>
          <button
            type="button"
            onClick={exportSelection}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className={exporting ? 'ri-loader-4-line animate-spin' : 'ri-file-pdf-2-line'} />
            {exporting ? t('req_export_busy') : t('req_export_selected')}
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100"
          >
            <i className="ri-close-line" />{t('req_clear_selection')}
          </button>
        </div>
      )}

      <div className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
        {storeStatus === 'error' && <div className="p-4"><ErrorBlock message={error} onRetry={() => reloadStore()} /></div>}
        {storeStatus !== 'error' && (storeStatus === 'idle' || storeStatus === 'loading') && <LoadingBlock />}
        {storeStatus === 'ready' && rows.length === 0 ? (
          <div className="py-16 text-center text-foreground-500">
            <i className="ri-inbox-line text-3xl" />
            <p className="mt-2 text-sm">{t('empty_requests')}</p>
          </div>
        ) : storeStatus !== 'ready' ? null : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left font-label text-[10px] uppercase tracking-widest text-foreground-500 bg-background-100">
                  <th className="ps-4 pe-1 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label={t('req_select_all')}
                      className="w-4 h-4 accent-primary-500 cursor-pointer align-middle"
                    />
                  </th>
                  <th className="px-4 py-3">{t('col_request')}</th>
                  <th className="px-4 py-3">{t('col_service')}</th>
                  <th className="px-4 py-3">{t('col_user')}</th>
                  <th className="px-4 py-3">{t('col_env')}</th>
                  <th className="px-4 py-3">{t('col_status')}</th>
                  <th className="px-4 py-3">{t('col_duration')}</th>
                  <th className="px-4 py-3">{t('col_date')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-background-200">
                {rows.map((r) => {
                  const st = STATUS_STYLE[r.status];
                  const checked = selected.includes(r.id);
                  return (
                    <tr key={r.id} className={`transition-colors ${checked ? 'bg-primary-500/5' : 'hover:bg-background-100/70'}`}>
                      <td className="ps-4 pe-1 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.id)}
                          aria-label={t('req_select_row', { ref: r.id })}
                          className="w-4 h-4 accent-primary-500 cursor-pointer align-middle"
                        />
                      </td>
                      <td className="px-4 py-3 font-label text-xs text-foreground-800 whitespace-nowrap">{r.id}</td>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-foreground-950">{tx(r.service, lang)}</span>
                        <span className="block font-label text-[10px] uppercase tracking-wider text-foreground-500">{t(`cat_${r.category}`)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-label text-[10px] shrink-0">{r.initials}</span>
                          <span className="min-w-0">
                            <span className="block text-foreground-900 truncate">{r.user}</span>
                            <span className="block text-[11px] text-foreground-500 truncate">{r.tenant}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-label text-xs uppercase text-foreground-600">{r.environment}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[11px] whitespace-nowrap ${st.cls}`}>
                          <i className={`${st.icon} ${r.status === 'running' ? 'animate-spin' : ''}`} />
                          {t(`status_${r.status}`)}
                        </span>
                        {r.status === 'running' && (
                          <span className="mt-1.5 block h-1 w-20 rounded-full bg-background-200 overflow-hidden">
                            <span className="block h-full rounded-full bg-primary-500" style={{ width: `${r.progress}%` }} />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-label text-xs text-foreground-700 whitespace-nowrap">{formatDuration(r.durationSec, lang)}</td>
                      <td className="px-4 py-3 text-xs text-foreground-600 whitespace-nowrap">{formatDate(r.createdAt, lang)}</td>
                      <td className="px-4 py-3">
                        <Link to={`/requests/${r.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-background-300 text-xs whitespace-nowrap hover:bg-primary-500 hover:text-background-50 hover:border-primary-500 transition-colors cursor-pointer">
                          {t('view_details')}<i className="ri-arrow-right-line" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-4 md:right-8 z-50 max-w-sm p-3.5 rounded-xl bg-foreground-950 text-background-50 shadow-lg flex items-start gap-2.5">
          <span className="w-5 h-5 flex items-center justify-center text-primary-300 shrink-0"><i className="ri-file-pdf-2-line" /></span>
          <p className="text-sm">{toast}</p>
          <button type="button" onClick={() => setToast(null)} aria-label={t('admin_close')} className="ml-2 w-5 h-5 flex items-center justify-center text-background-300 hover:text-background-50 cursor-pointer">
            <i className="ri-close-line" />
          </button>
        </div>
      )}
    </div>
  );
}