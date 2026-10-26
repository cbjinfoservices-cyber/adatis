import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import ApprovalListItem from '@/pages/approvals/components/ApprovalListItem';
import ApprovalDetail from '@/pages/approvals/components/ApprovalDetail';
import DecisionAuditLog from '@/pages/approvals/components/DecisionAuditLog';
import { api } from '@/utils/api';
import { loadStore, reloadStore, useStore } from '@/utils/store';
import { hoursLeft, isUrgent } from '@/utils/approvals';
import { getRequest } from '@/utils/executions';

type Tab = 'mine' | 'pending' | 'decided';

export default function ApprovalsPage() {
  const { t } = useTranslation();
  const { approvals, audit, status, error, failedResources } = useStore();
  const [tab, setTab] = useState<Tab>('mine');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadStore();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const items = approvals;

  const counts = useMemo(() => ({
    mine: items.filter((i) => i.decision === 'pending' && i.myTurn).length,
    pending: items.filter((i) => i.decision === 'pending').length,
    decided: items.filter((i) => i.decision !== 'pending').length,
    urgent: items.filter((i) => isUrgent(i)).length,
  }), [items]);

  const list = useMemo(() => {
    if (tab === 'mine') return items.filter((i) => i.decision === 'pending' && i.myTurn);
    if (tab === 'decided') return items.filter((i) => i.decision !== 'pending');
    return items.filter((i) => i.decision === 'pending');
  }, [items, tab]);

  const selected = list.find((i) => i.id === selectedId) || list[0] || null;

  const decide = async (id: string, kind: 'approve' | 'reject', reason?: string) => {
    const ref = items.find((i) => i.id === id);
    setDeciding(true);
    try {
      await api.post(`/approvals/${id}/decision`, {
        decision: kind === 'approve' ? 'approved' : 'rejected',
        comment: reason || '',
      });
      await reloadStore();
      setToast(kind === 'approve'
        ? t('appr_toast_approved', { ref: ref?.requestId || id })
        : t('appr_toast_rejected', { ref: ref?.requestId || id }));
    } catch {
      setToast(t('data_error_title'));
    } finally {
      setDeciding(false);
    }
  };

  const kpis = [
    { key: 'pending', label: t('appr_kpi_pending'), value: counts.pending, icon: 'ri-inbox-archive-line', tone: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900' },
    { key: 'mine', label: t('appr_kpi_mine'), value: counts.mine, icon: 'ri-user-follow-line', tone: 'bg-primary-100 text-primary-700 dark:text-primary-900' },
    { key: 'urgent', label: t('appr_kpi_urgent'), value: counts.urgent, icon: 'ri-alarm-warning-line', tone: 'bg-accent-100 text-accent-900' },
    { key: 'decided', label: t('appr_kpi_decided'), value: counts.decided, icon: 'ri-checkbox-circle-line', tone: 'bg-background-200 text-foreground-800' },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: t('appr_tab_mine') },
    { key: 'pending', label: t('appr_tab_pending') },
    { key: 'decided', label: t('appr_tab_decided') },
  ];

  const failed = failedResources.includes('approvals');

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('appr_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600">{t('appr_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-background-50 border border-background-200">
            {['manager', 'technical', 'security'].map((level, index) => (
              <span key={level} className="flex items-center gap-1.5">
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background-100 text-xs text-foreground-800 whitespace-nowrap">
                  <span className="w-4 h-4 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-label text-[9px]">{index + 1}</span>
                  {t(`appr_level_${level}`)}
                </span>
                {index < 2 && <i className="ri-arrow-right-s-line text-foreground-400" />}
              </span>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {kpis.map((k) => (
            <div key={k.key} className="p-4 rounded-xl bg-background-50 border border-background-200">
              <div className="flex items-start justify-between gap-2">
                <span className="font-label text-[11px] uppercase tracking-wider text-foreground-500">{k.label}</span>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.tone}`}><i className={k.icon} /></span>
              </div>
              <p className="mt-3 font-heading text-2xl md:text-3xl font-bold text-foreground-950">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex px-1 py-1 rounded-full bg-background-200">
            {tabs.map((tb) => (
              <button key={tb.key} type="button" onClick={() => { setTab(tb.key); setSelectedId(null); }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap cursor-pointer transition-colors ${tab === tb.key ? 'bg-background-50 text-foreground-950 shadow-sm font-semibold' : 'text-foreground-600 hover:text-foreground-900'}`}>
                {tb.label}
                <span className="font-label text-[11px] opacity-70">{counts[tb.key]}</span>
              </button>
            ))}
          </div>
          <span className="font-label text-[11px] text-foreground-500 sm:ml-auto">
            {t('appr_queue_hint')} · {t('appr_sla_hint')}
          </span>
        </div>

        {failed ? (
          <ErrorBlock message={error} onRetry={() => reloadStore()} />
        ) : status === 'loading' && items.length === 0 ? (
          <LoadingBlock />
        ) : list.length === 0 || !selected ? (
          <div className="rounded-xl bg-background-50 border border-background-200 py-16 text-center">
            <span className="w-12 h-12 mx-auto rounded-full bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-xl" />
            </span>
            <p className="mt-3 text-sm text-foreground-600">{t('appr_empty')}</p>
          </div>
        ) : (
          <div className="flex flex-col xl:flex-row gap-4 items-start">
            <div className="w-full xl:w-[400px] shrink-0 space-y-2">
              {list.map((item) => (
                <ApprovalListItem
                  key={item.id}
                  item={item}
                  active={selected.id === item.id}
                  onSelect={() => setSelectedId(item.id)}
                />
              ))}
              <p className="px-1 pt-1 font-label text-[11px] text-foreground-500">
                {t('appr_oldest_first')} · {hoursLeft(selected.dueAt) > 0 ? t('appr_due_in', { h: hoursLeft(selected.dueAt) }) : t('appr_overdue')}
              </p>
            </div>
            <div className="w-full min-w-0 flex-1">
              <ApprovalDetail
                key={selected.id}
                item={selected}
                busy={deciding}
                hasRequest={Boolean(getRequest(selected.requestId))}
                onApprove={() => decide(selected.id, 'approve')}
                onReject={(reason) => decide(selected.id, 'reject', reason)}
              />
            </div>
          </div>
        )}

        <DecisionAuditLog entries={audit} />
      </div>

      {toast && (
        <div className="fixed bottom-6 right-4 md:right-8 z-50 max-w-sm p-3.5 rounded-xl bg-foreground-950 text-background-50 shadow-lg flex items-start gap-2.5">
          <span className="w-5 h-5 flex items-center justify-center text-primary-300 shrink-0"><i className="ri-checkbox-circle-fill" /></span>
          <p className="text-sm">{toast}</p>
          <button type="button" onClick={() => setToast(null)} aria-label={t('appr_close')} className="ml-2 w-5 h-5 flex items-center justify-center text-background-300 hover:text-background-50 cursor-pointer">
            <i className="ri-close-line" />
          </button>
        </div>
      )}
    </AppShell>
  );
}