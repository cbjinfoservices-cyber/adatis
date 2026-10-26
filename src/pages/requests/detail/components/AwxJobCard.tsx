import { useTranslation } from 'react-i18next';
import { AWX_STATUS_STYLE, formatDate, type AwxJob } from '@/utils/executions';

type Props = {
  job: AwxJob | null;
  canLaunch: boolean;
  launching: boolean;
  syncing: boolean;
  autoRefresh?: boolean;
  launchBlocked: 'no_template' | 'auth_disabled' | 'no_token' | 'no_session' | 'rbac_forbidden'
    | 'approval_pending' | 'approval_rejected' | null;
  lastError: string | null;
  onLaunch: () => void;
  onSync: () => void;
};

const BLOCK_REASON: Record<string, string> = {
  no_template: 'awx_job_no_template',
  auth_disabled: 'awx_job_no_auth',
  no_token: 'awx_job_no_token',
  no_session: 'awx_job_no_token',
  rbac_forbidden: 'awx_job_no_rbac',
  approval_pending: 'awx_job_approval_pending',
  approval_rejected: 'awx_job_approval_rejected',
};

export default function AwxJobCard({
  job, canLaunch, launching, syncing, autoRefresh = false, launchBlocked, lastError, onLaunch, onSync,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 p-4 md:p-5">
      <div className="flex flex-wrap items-start gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
          <i className="ri-play-circle-line" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('awx_job_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">{t('awx_job_hint')}</p>
        </div>
        {job && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${AWX_STATUS_STYLE[job.status] || 'bg-background-200 text-foreground-600'}`}>
            <i className={job.status === 'running' ? 'ri-loader-4-line animate-spin' : 'ri-circle-fill text-[6px]'} />
            {t(`awx_status_${job.status}`)}
          </span>
        )}
        {autoRefresh && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-500/10 text-primary-700 dark:text-primary-300 font-label text-[10px] whitespace-nowrap">
            <i className="ri-live-line" aria-hidden="true" />{t('awx_job_auto_on')}
          </span>
        )}
      </div>

      {job ? (
        <>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="min-w-0 p-2.5 rounded-lg bg-background-100 border border-background-200">
              <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('awx_job_id')}</p>
              <p className="mt-0.5 font-label text-sm font-semibold text-foreground-950 tabular-nums">#{job.jobId}</p>
            </div>
            <div className="min-w-0 p-2.5 rounded-lg bg-background-100 border border-background-200">
              <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('awx_job_type')}</p>
              <p className="mt-0.5 text-sm text-foreground-900 truncate">
                {t(job.kind === 'workflow' ? 'awx_track_kind_workflow' : 'awx_track_kind_job')}
              </p>
            </div>
            <div className="min-w-0 p-2.5 rounded-lg bg-background-100 border border-background-200">
              <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('awx_job_template')}</p>
              <p className="mt-0.5 text-sm text-foreground-900 truncate" title={job.templateName || String(job.templateId || '')}>
                {job.templateName || (job.templateId ? `#${job.templateId}` : '—')}
              </p>
            </div>
          </div>

          <dl className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-label text-[11px] text-foreground-600">
            {job.launchedBy && (
              <div className="flex items-center gap-1.5 min-w-0">
                <dt className="inline-flex items-center gap-1 text-foreground-500">
                  <i className="ri-user-3-line" aria-hidden="true" />{t('awx_job_launched_by')}
                </dt>
                <dd className="truncate text-foreground-900 font-medium">{job.launchedBy}</dd>
              </div>
            )}
            {job.startedAt && (
              <div className="flex items-center gap-1.5">
                <dt className="inline-flex items-center gap-1 text-foreground-500">
                  <i className="ri-time-line" aria-hidden="true" />{t('awx_job_started')}
                </dt>
                <dd className="text-foreground-900">{formatDate(job.startedAt, lang)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {job.jobUrl && (
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                <i className="ri-external-link-line" aria-hidden="true" />{t('awx_job_open')}
              </a>
            )}
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={syncing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} aria-hidden="true" />
              {syncing ? t('awx_job_syncing') : t('awx_job_sync')}
            </button>
            <span className="font-label text-[10px] text-foreground-500">{t('awx_job_security')}</span>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 rounded-lg border border-dashed border-background-300 bg-background-100 p-3">
            <p className="text-xs text-foreground-700 leading-relaxed">
              {launchBlocked ? t(BLOCK_REASON[launchBlocked] || 'awx_job_no_template') : t('awx_job_none')}
            </p>
            {lastError && (
              <p className="mt-1.5 font-label text-[10px] text-accent-700 break-words" dir="ltr">{lastError}</p>
            )}
          </div>
          {canLaunch && !launchBlocked && (
            <button
              type="button"
              onClick={onLaunch}
              disabled={launching}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={launching ? 'ri-loader-4-line animate-spin' : 'ri-play-line'} aria-hidden="true" />
              {launching ? t('awx_job_launching') : t('awx_job_launch')}
            </button>
          )}
        </>
      )}
    </section>
  );
}