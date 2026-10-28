import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import ExecutionTimeline from '@/pages/requests/detail/components/ExecutionTimeline';
import JobOutput from '@/pages/requests/detail/components/JobOutput';
import AwxJobCard from '@/pages/requests/detail/components/AwxJobCard';
import WorkflowNodesCard from '@/pages/requests/detail/components/WorkflowNodesCard';
import { ResultCard, ErrorCard } from '@/pages/requests/detail/components/ResultPanels';
import { tx, localeOf } from '@/utils/catalog';
import {
  ACTIVE_AWX, STATUS_STYLE, businessLabel, formatDate, formatDuration,
  type RequestItem, type RequestDetailData,
} from '@/utils/executions';
import { api, ApiError } from '@/utils/api';
import { cancelRequestJob, launchRequestJob } from '@/utils/awxJobs';
import { loadStore, useStore } from '@/utils/store';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import { exportExecutionPdf } from '@/utils/pdf';
import Toast from '@/components/base/Toast';
import useToast from '@/hooks/useToast';

/** Relecture de la demande tant que son job tourne (l'API lit la base, tenue à jour en fond). */
const POLL_MS = 5000;

type AwxBlocked = 'no_template' | 'auth_disabled' | 'no_token' | 'no_session' | 'rbac_forbidden'
  | 'approval_pending' | 'approval_rejected' | null;

const BLOCK_CODES = ['no_template', 'awx_disabled', 'no_token', 'no_session', 'rbac_forbidden', 'approval_pending', 'approval_rejected'];

type RequestData = RequestItem & RequestDetailData;

const errorPayload = (err: unknown) => (
  err instanceof ApiError ? (err.detail as { error?: string; message?: string } | undefined) || null : null
);

export default function RequestDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { services } = useStore();
  const [data, setData] = useState<RequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast, notify, dismiss } = useToast();
  const [awxLaunching, setAwxLaunching] = useState(false);
  const [awxSyncing, setAwxSyncing] = useState(false);
  const [awxCanceling, setAwxCanceling] = useState(false);
  const [awxBlocked, setAwxBlocked] = useState<AwxBlocked>(null);
  const [awxError, setAwxError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  /** Job dont la sortie est affichée : null = job courant. */
  const [outputJobId, setOutputJobId] = useState<number | null>(null);
  const [outputText, setOutputText] = useState('');

  const refresh = useCallback(async () => {
    const fresh = await api.get<RequestData>(`/requests/${id}`);
    setData(fresh);
    setPulse((value) => value + 1);
    return fresh;
  }, [id]);

  useEffect(() => {
    loadStore();
    let active = true;
    setLoading(true);
    setFailed(false);
    setOutputJobId(null);
    api
      .get<RequestData>(`/requests/${id}`)
      .then((fresh) => {
        if (!active) return;
        setData(fresh);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const awx = data?.awx ?? null;
  const awxActive = Boolean(awx?.jobId) && ACTIVE_AWX.includes(String(awx?.status || '').toLowerCase());

  // L'état du job est synchronisé côté serveur : la page relit simplement la demande.
  useEffect(() => {
    if (!awxActive) return undefined;
    const timer = window.setInterval(() => {
      refresh().catch(() => { /* API momentanément injoignable : prochaine passe */ });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [awxActive, refresh]);

  const syncAwx = async () => {
    setAwxSyncing(true);
    setAwxError(null);
    try {
      await api.post<RequestItem>(`/requests/${id}/awx/sync`);
      await refresh();
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
      await launchRequestJob(String(id));
      setOutputJobId(null);
      await refresh();
      notify(t('awx_job_launched'));
    } catch (err) {
      const payload = errorPayload(err);
      const code = payload?.error || '';
      if (BLOCK_CODES.includes(code)) {
        setAwxBlocked(code as Exclude<AwxBlocked, null>);
      } else {
        setAwxError(payload?.message || t('awx_job_launch_failed'));
      }
      // Un lancement refusé est enregistré sur la demande : on l'affiche.
      await refresh().catch(() => {});
    } finally {
      setAwxLaunching(false);
    }
  };

  const cancelAwx = async () => {
    if (!window.confirm(t('awx_job_cancel_confirm'))) return;
    setAwxCanceling(true);
    setAwxError(null);
    try {
      await cancelRequestJob(String(id));
      await refresh();
      notify(t('awx_job_canceled'));
    } catch (err) {
      const code = errorPayload(err)?.error || '';
      setAwxError(t(code === 'rbac_forbidden' ? 'awx_job_no_rbac' : 'awx_job_cancel_failed'));
      await refresh().catch(() => {});
    } finally {
      setAwxCanceling(false);
    }
  };

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

  if (failed || !data) {
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

  const request = data;
  const { status, progress } = request;
  const steps = data.timeline || [];
  const attempts = data.attempts || [];
  const service = services.find((s) => s.id === request.serviceId);
  const st = STATUS_STYLE[status];
  const lang = i18n.language;

  // Job bloqué tant que l'approbation n'est pas accordée (contrôlé aussi par l'API).
  let approvalBlock: AwxBlocked = null;
  if (request.approvalState === 'pending') approvalBlock = 'approval_pending';
  else if (request.approvalState === 'rejected') approvalBlock = 'approval_rejected';
  const hasAwxJob = Boolean(awx?.jobId);
  const canRelaunch = hasAwxJob && !awxActive && ['failed', 'canceled'].includes(status) && !approvalBlock;
  const hasOutput = hasAwxJob || attempts.some((a) => a.jobId && a.kind === 'job');

  let queuedNotice = '';
  if (status === 'queued') {
    if (request.approvalState === 'pending') queuedNotice = t('exec_queued_notice');
    else if (hasAwxJob) queuedNotice = t('exec_queued_awx');
  }

  const exportPdf = () => {
    setExporting(true);
    try {
      const fileName = `${request.id}-recapitulatif.pdf`;
      // Journal : fin de la sortie Ascender affichée, sinon le journal enregistré.
      const outputLines = outputText.split('\n').map((line) => line.trimEnd()).filter(Boolean);
      const logs = outputLines.length
        ? outputLines.map((text) => ({ time: '', level: 'info', text }))
        : (data.logs || []).map((l) => ({ time: l.time, level: l.level, text: tx(l.text, lang) }));
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
        result: data.result && status === 'success'
          ? {
            title: businessLabel(data.result.type, lang.startsWith('en') ? 'en' : 'fr'),
            fields: data.result.fields.map((f) => ({ label: tx(f.label, lang), value: f.value })),
          }
          : undefined,
        error: data.error && status !== 'running' && status !== 'success'
          ? {
            code: data.error.code,
            severity: data.error.severity,
            reason: tx(data.error.reason, lang),
            solution: tx(data.error.solution, lang),
          }
          : undefined,
        logs,
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
      notify(t('pdf_ready', { file: fileName }));
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
            {request.tenant && <span>· {request.tenant}</span>}
            {status === 'running' && <span>· {t('exec_progress_estimated')}</span>}
            {queuedNotice && <span className="text-accent-700">· {queuedNotice}</span>}
            {status === 'canceled' && <span className="text-foreground-600">· {t(hasAwxJob ? 'exec_canceled_awx' : 'exec_canceled_notice')}</span>}
          </div>
        </section>

        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <div className="w-full lg:w-[360px] shrink-0 p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
            <h2 className="font-heading font-semibold text-foreground-950">{t('exec_timeline')}</h2>
            <ExecutionTimeline steps={steps} />
          </div>
          <div className="flex-1 min-w-0 w-full space-y-5">
            {data.error && status !== 'running' && status !== 'success' && <ErrorCard error={data.error} />}
            {data.result && status === 'success' && <ResultCard result={data.result} />}
            {!data.result && status === 'success' && (
              <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-primary-300 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center"><i className="ri-checkbox-circle-fill" /></span>
                <p className="text-sm text-foreground-800">{t('exec_business_result')} : <strong className="text-foreground-950">{t('success_title')}</strong></p>
              </section>
            )}
            <AwxJobCard
              job={awx}
              attempts={attempts}
              durationSec={request.durationSec}
              launchError={request.launchError || ''}
              canLaunch={!hasAwxJob && status !== 'success' && !approvalBlock}
              canRelaunch={canRelaunch}
              launching={awxLaunching}
              syncing={awxSyncing}
              canceling={awxCanceling}
              autoRefresh={awxActive}
              launchBlocked={awxBlocked || approvalBlock}
              lastError={awxError}
              awaitingRequester={Boolean(request.awaitingRequester)}
              outputJobId={outputJobId}
              onLaunch={() => { void launchAwx(); }}
              onSync={() => { void syncAwx(); }}
              onCancel={() => { void cancelAwx(); }}
              onShowOutput={setOutputJobId}
            />
            {awx?.kind === 'workflow' && awx.jobId > 0 && (
              <WorkflowNodesCard
                requestId={request.id}
                jobUrl={awx.jobUrl}
                active={awxActive}
                refreshKey={pulse}
                selectedJobId={outputJobId}
                onShowOutput={setOutputJobId}
              />
            )}
            {hasOutput && (
              <JobOutput
                requestId={request.id}
                jobId={outputJobId}
                needsNode={awx?.kind === 'workflow' && outputJobId === null}
                active={awxActive}
                refreshKey={awx?.jobId || 0}
                onText={setOutputText}
              />
            )}
          </div>
        </div>
      </div>

      <Toast toast={toast} onClose={dismiss} />
    </AppShell>
  );
}
