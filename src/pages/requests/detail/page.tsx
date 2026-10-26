import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import ExecutionTimeline from '@/pages/requests/detail/components/ExecutionTimeline';
import ExecutionLogs from '@/pages/requests/detail/components/ExecutionLogs';
import AwxJobCard from '@/pages/requests/detail/components/AwxJobCard';
import WorkflowNodesCard from '@/pages/requests/detail/components/WorkflowNodesCard';
import { ResultCard, ErrorCard } from '@/pages/requests/detail/components/ResultPanels';
import { tx, localeOf } from '@/utils/catalog';
import {
  STATUS_STYLE, businessLabel, formatDate, formatDuration, LIVE_LOG_TEMPLATES,
  type ExecutionStatus, type LogLine, type TimelineStep, type RequestItem, type RequestDetailData, type AwxJob,
} from '@/utils/executions';
import { api, ApiError } from '@/utils/api';
import { loadStore, useStore } from '@/utils/store';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import { exportExecutionPdf } from '@/utils/pdf';

const nowTime = () => new Date().toLocaleTimeString('fr-FR', { hour12: false });

const ACTIVE_AWX = ['new', 'pending', 'waiting', 'running', 'queued'];

type AwxBlocked = 'no_template' | 'auth_disabled' | 'no_token' | 'no_session' | 'rbac_forbidden' | null;

export default function RequestDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { services } = useStore();
  const [request, setRequest] = useState<RequestItem | null>(null);
  const [detail, setDetail] = useState<RequestDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [status, setStatus] = useState<ExecutionStatus>('queued');
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [awx, setAwx] = useState<AwxJob | null>(null);
  const [awxLaunching, setAwxLaunching] = useState(false);
  const [awxSyncing, setAwxSyncing] = useState(false);
  const [awxBlocked, setAwxBlocked] = useState<AwxBlocked>(null);
  const [awxError, setAwxError] = useState<string | null>(null);
  const [awxPulse, setAwxPulse] = useState(0);
  const templateIndex = useRef(0);

  useEffect(() => {
    loadStore();
    let active = true;
    setLoading(true);
    setFailed(false);
    api
      .get<RequestItem & RequestDetailData>(`/requests/${id}`)
      .then((data) => {
        if (!active) return;
        setRequest({ ...data });
        setDetail({ timeline: data.timeline || [], logs: data.logs || [], result: data.result, error: data.error });
        setStatus(data.status);
        setProgress(data.progress);
        setSteps(data.timeline || []);
        setLogs(data.logs || []);
        setAwx(data.awx ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  // Un job AWX suit son état réel : la simulation locale est désactivée.
  const hasAwxJob = Boolean(awx?.jobId);
  const awxActive = hasAwxJob && ACTIVE_AWX.includes(String(awx?.status || '').toLowerCase());
  const isLive = status === 'running' && !paused && !hasAwxJob;

  // Rafraîchissement automatique de l'état du job AWX tant qu'il tourne.
  useEffect(() => {
    if (!awxActive) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const fresh = await api.post<RequestItem>(`/requests/${id}/awx/sync`);
        if (fresh.awx) setAwx(fresh.awx);
        setStatus(fresh.status);
        setProgress(fresh.progress);
        setAwxPulse((value) => value + 1);
      } catch {
        /* AWX momentanément injoignable : la prochaine passe réessaiera */
      }
    }, 8000);
    return () => window.clearInterval(timer);
  }, [awxActive, id]);

  const syncAwx = async () => {
    setAwxSyncing(true);
    setAwxError(null);
    try {
      const fresh = await api.post<RequestItem>(`/requests/${id}/awx/sync`);
      if (fresh.awx) setAwx(fresh.awx);
      setStatus(fresh.status);
      setProgress(fresh.progress);
      setAwxPulse((value) => value + 1);
    } catch {
      setAwxError(t('awx_job_sync_failed'));
    } finally {
      setAwxSyncing(false);
    }
  };

  const launchAwx = async () => {
    setAwxLaunching(true);
    setAwxError(null);
    try {
      const fresh = await api.post<RequestItem>(`/requests/${id}/awx/launch`);
      setAwx(fresh.awx ?? null);
      setStatus(fresh.status);
      setProgress(fresh.progress);
      setToast(t('awx_job_launched'));
    } catch (err) {
      const payload = err instanceof ApiError ? (err.detail as { error?: string; message?: string }) : null;
      const code = payload?.error || '';
      if (code === 'no_template' || code === 'awx_disabled' || code === 'no_token' || code === 'no_session' || code === 'rbac_forbidden') {
        setAwxBlocked(code as Exclude<AwxBlocked, null>);
      } else {
        setAwxError(payload?.message || t('awx_job_launch_failed'));
      }
    } finally {
      setAwxLaunching(false);
    }
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isLive) return undefined;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 5, 100);
        setSteps((current) => {
          const runningIdx = current.findIndex((s) => s.status === 'running');
          const target = Math.min(Math.floor((next / 100) * current.length), current.length - 1);
          if (runningIdx === -1) return current;
          return current.map((s, i) => {
            if (i < target) return s.status === 'success' ? s : { ...s, status: 'success' as const };
            if (i === target) return s.status === 'running' ? s : { ...s, status: 'running' as const };
            return s;
          });
        });
        const tpl = LIVE_LOG_TEMPLATES[templateIndex.current % LIVE_LOG_TEMPLATES.length];
        templateIndex.current += 1;
        setLogs((l) => [...l, { time: nowTime(), level: tpl.level as LogLine['level'], text: tpl.text }]);
        if (next >= 100) {
          setStatus('success');
          setSteps((cur) => cur.map((s) => ({ ...s, status: 'success' as const })));
          setLogs((l) => [...l, { time: nowTime(), level: 'success', text: { fr: 'Exécution terminée, service disponible', en: 'Execution finished, service available' } }]);
        }
        return next;
      });
    }, 2400);
    return () => window.clearInterval(timer);
  }, [isLive]);

  if (loading) {
    return (
      <AppShell>
        <div className="px-4 md:px-10 py-8">
          <Link to="/requests" className="inline-flex items-center gap-1 text-sm text-foreground-600 hover:text-primary-600 cursor-pointer">
            <i className="ri-arrow-left-line" />{t('back_requests')}
          </Link>
          <LoadingBlock />
        </div>
      </AppShell>
    );
  }

  if (failed || !request || !detail) {
    return (
      <AppShell>
        <div className="px-4 md:px-10 py-8 space-y-4">
          <Link to="/requests" className="inline-flex items-center gap-1 text-sm text-foreground-600 hover:text-primary-600 cursor-pointer">
            <i className="ri-arrow-left-line" />{t('back_requests')}
          </Link>
          <ErrorBlock onRetry={() => window.location.reload()} />
        </div>
      </AppShell>
    );
  }

  const service = services.find((s) => s.id === request.serviceId);
  const st = STATUS_STYLE[status];
  const lang = i18n.language;

  const retry = () => {
    setStatus('running');
    setProgress(8);
    setSteps(detail.timeline.map((s, i) => ({ ...s, status: i === 0 ? 'success' : i === 1 ? 'running' : 'pending' })));
    setLogs([{ time: nowTime(), level: 'info', text: { fr: 'Nouvelle tentative lancée', en: 'Retry started' } }]);
  };

  const exportPdf = () => {
    setExporting(true);
    try {
      const fileName = `${request.id}-recapitulatif.pdf`;
      exportExecutionPdf({
        ref: request.id,
        service: tx(request.service, lang),
        status: t(`status_${status}`),
        user: request.user,
        tenant: request.tenant,
        environment: request.environment,
        createdAt: formatDate(request.createdAt, lang),
        progress,
        duration: request.durationSec ? formatDuration(request.durationSec, lang) : '—',
        approval: t(`approval_${request.approval}`),
        steps: steps.map((s) => ({
          label: t(`step_${s.key}`),
          state: t(`pdf_step_${s.status}`),
          note: tx(s.note, lang),
          tone: s.status,
        })),
        result: detail.result && status === 'success'
          ? {
            title: businessLabel(detail.result.type, lang.startsWith('en') ? 'en' : 'fr'),
            fields: detail.result.fields.map((f) => ({ label: tx(f.label, lang), value: f.value })),
          }
          : undefined,
        error: detail.error && status !== 'running' && status !== 'success'
          ? {
            code: detail.error.code,
            severity: detail.error.severity,
            reason: tx(detail.error.reason, lang),
            solution: tx(detail.error.solution, lang),
          }
          : undefined,
        logs: logs.map((l) => ({ time: l.time, level: l.level, text: tx(l.text, lang) })),
        labels: {
          title: t('pdf_title'),
          request: t('pdf_section_request'),
          ref: t('pdf_ref'),
          service: t('pdf_service'),
          user: t('pdf_requested_by'),
          tenant: t('pdf_tenant'),
          env: t('pdf_env'),
          created: t('pdf_created'),
          status: t('pdf_status'),
          duration: t('pdf_duration'),
          approval: t('pdf_approval'),
          progressTitle: t('pdf_section_progress'),
          timeline: t('pdf_section_timeline'),
          result: t('pdf_section_result'),
          error: t('pdf_section_error'),
          logs: t('pdf_section_logs'),
          truncated: t('pdf_truncated'),
          generated: t('pdf_generated', { date: new Date().toLocaleString(localeOf(lang)) }),
        },
        fileName,
      });
      setToast(t('pdf_ready', { file: fileName }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <Link to="/requests" className="inline-flex items-center gap-1 text-sm text-foreground-600 hover:text-primary-600 cursor-pointer">
          <i className="ri-arrow-left-line" />{t('back_requests')}
        </Link>

        <header className="flex flex-col lg:flex-row lg:items-center gap-4">
          <span className="w-14 h-14 rounded-xl bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center shrink-0">
            <i className={`${service?.icon || 'ri-flashlight-line'} text-2xl`} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-label text-xs text-foreground-500">{request.id}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[11px] ${st.cls}`}>
                <i className={`${st.icon} ${status === 'running' ? 'animate-spin' : ''}`} />{t(`status_${status}`)}
              </span>
              <span className="font-label text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">{request.environment}</span>
            </div>
            <h1 className="mt-1 font-heading text-xl md:text-3xl font-bold text-foreground-950">{tx(request.service, lang)}</h1>
            <p className="text-sm text-foreground-600">{t('exec_started_by')} {request.user} · {request.tenant} · {formatDate(request.createdAt, lang)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportPdf}
              disabled={exporting}
              className="px-4 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={exporting ? 'ri-loader-4-line mr-1 animate-spin' : 'ri-file-pdf-2-line mr-1'} />
              {exporting ? t('pdf_busy') : t('pdf_export')}
            </button>
            {status === 'running' && (
              <button type="button" onClick={() => setPaused((p) => !p)} className="px-4 py-2 rounded-lg border border-background-300 text-sm whitespace-nowrap cursor-pointer hover:bg-background-200">
                <i className={paused ? 'ri-play-line mr-1' : 'ri-pause-line mr-1'} />{paused ? t('exec_resume') : t('exec_pause')}
              </button>
            )}
            {(status === 'failed' || status === 'canceled') && (
              <button type="button" onClick={retry} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer">
                <i className="ri-restart-line mr-1" />{t('exec_retry')}
              </button>
            )}
          </div>
        </header>

        <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading font-semibold text-foreground-950">{t('exec_progress')}</h2>
            <span className="font-label text-sm font-semibold text-primary-700 dark:text-primary-300">{progress} %</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-background-200 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${status === 'failed' ? 'bg-accent-600' : status === 'canceled' ? 'bg-secondary-400' : 'bg-primary-500'}`} style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 font-label text-[11px] text-foreground-500">
            <span>{t('summary_eta')} : ~{request.durationSec ? formatDuration(request.durationSec, lang) : `${service?.estimatedMinutes ?? 0} min`}</span>
            <span>·</span>
            <span>{request.tenant}</span>
            {status === 'queued' && <span className="text-accent-700">· {t('exec_queued_notice')}</span>}
            {status === 'canceled' && <span className="text-foreground-600">· {t('exec_canceled_notice')}</span>}
          </div>
        </section>

        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <div className="w-full lg:w-[360px] shrink-0 p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
            <h2 className="font-heading font-semibold text-foreground-950">{t('exec_timeline')}</h2>
            <ExecutionTimeline steps={steps} />
          </div>
          <div className="flex-1 min-w-0 w-full space-y-5">
            {detail.error && status !== 'running' && status !== 'success' && <ErrorCard error={detail.error} />}
            {detail.result && status === 'success' && <ResultCard result={detail.result} />}
            {!detail.result && status === 'success' && (
              <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-primary-300 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center"><i className="ri-checkbox-circle-fill" /></span>
                <p className="text-sm text-foreground-800">{t('exec_business_result')} : <strong className="text-foreground-950">{t('success_title')}</strong></p>
              </section>
            )}
            <AwxJobCard
              job={awx}
              canLaunch={!hasAwxJob && status !== 'success'}
              launching={awxLaunching}
              syncing={awxSyncing}
              autoRefresh={awxActive}
              launchBlocked={awxBlocked}
              lastError={awxError}
              onLaunch={() => { void launchAwx(); }}
              onSync={() => { void syncAwx(); }}
            />
            {awx?.kind === 'workflow' && awx.jobId > 0 && (
              <WorkflowNodesCard
                requestId={request.id}
                jobUrl={awx.jobUrl}
                active={awxActive}
                refreshKey={awxPulse}
              />
            )}
            <ExecutionLogs logs={logs} />
          </div>
        </div>
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
    </AppShell>
  );
}