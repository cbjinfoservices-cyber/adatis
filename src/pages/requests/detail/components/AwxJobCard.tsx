import { useTranslation } from 'react-i18next';
import {
  ACTIVE_AWX, AWX_STATUS_STYLE, formatDate, formatDuration, type AwxJob, type JobAttempt,
} from '@/utils/executions';

type Props = {
  job: AwxJob | null;
  attempts: JobAttempt[];
  durationSec: number;
  /** Motif d'un lancement refusé par Ascender (code ou message brut). */
  launchError: string;
  canLaunch: boolean;
  /** Job terminé en échec ou annulé : un nouveau lancement est possible. */
  canRelaunch: boolean;
  launching: boolean;
  syncing: boolean;
  canceling: boolean;
  autoRefresh?: boolean;
  launchBlocked: 'no_template' | 'auth_disabled' | 'no_token' | 'no_session' | 'rbac_forbidden'
    | 'approval_pending' | 'approval_rejected' | null;
  lastError: string | null;
  /** Approuvée mais non lancée : le demandeur doit lancer le job. */
  awaitingRequester?: boolean;
  /** Job dont la sortie est affichée (tentative précédente). */
  outputJobId: number | null;
  onLaunch: () => void;
  onSync: () => void;
  onCancel: () => void;
  onShowOutput: (jobId: number | null) => void;
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

/** Motifs de refus connus ; les autres sont des messages d'Ascender affichés tels quels. */
const LAUNCH_ERROR: Record<string, string> = {
  no_awx_token: 'awx_job_no_token',
  rbac_forbidden: 'awx_job_no_rbac',
};

const badge = (status: string) => AWX_STATUS_STYLE[status] || 'bg-background-200 text-foreground-600';

export default function AwxJobCard({
  job, attempts, durationSec, launchError, canLaunch, canRelaunch, launching, syncing, canceling,
  autoRefresh = false, launchBlocked, lastError, awaitingRequester = false, outputJobId,
  onLaunch, onSync, onCancel, onShowOutput,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const active = Boolean(job && ACTIVE_AWX.includes(job.status));
  const headStatus = job?.status || (launchError ? 'launch_failed' : '');
  const relaunchLabel = attempts.length > 0 ? t('awx_job_relaunch') : t('awx_job_launch');

  const launchButton = (
    <button
      type="button"
      onClick={onLaunch}
      disabled={launching}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <i className={launching ? 'ri-loader-4-line animate-spin' : 'ri-restart-line'} aria-hidden="true" />
      {launching ? t('awx_job_launching') : relaunchLabel}
    </button>
  );

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
        {headStatus && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${badge(headStatus)}`}>
            <i className={headStatus === 'running' ? 'ri-loader-4-line animate-spin' : 'ri-circle-fill text-[6px]'} aria-hidden="true" />
            {t(`awx_status_${headStatus}`, { defaultValue: headStatus })}
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
            {job.finishedAt && (
              <div className="flex items-center gap-1.5">
                <dt className="inline-flex items-center gap-1 text-foreground-500">
                  <i className="ri-flag-line" aria-hidden="true" />{t('awx_job_finished')}
                </dt>
                <dd className="text-foreground-900">{formatDate(job.finishedAt, lang)}</dd>
              </div>
            )}
            {durationSec > 0 && (
              <div className="flex items-center gap-1.5">
                <dt className="inline-flex items-center gap-1 text-foreground-500">
                  <i className="ri-timer-line" aria-hidden="true" />{t('awx_job_duration')}
                </dt>
                <dd className="text-foreground-900 tabular-nums">{formatDuration(durationSec, lang)}</dd>
              </div>
            )}
            {job.syncedAt && (
              <div className="flex items-center gap-1.5 text-foreground-500">
                <i className="ri-refresh-line" aria-hidden="true" />
                {t('awx_job_synced', {
                  time: new Date(job.syncedAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                })}
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
            {active && (
              <button
                type="button"
                onClick={onCancel}
                disabled={canceling}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-400 bg-background-50 text-xs font-semibold text-accent-800 whitespace-nowrap cursor-pointer hover:bg-accent-100 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <i className={canceling ? 'ri-loader-4-line animate-spin' : 'ri-stop-circle-line'} aria-hidden="true" />
                {canceling ? t('awx_job_canceling') : t('awx_job_cancel')}
              </button>
            )}
            {canRelaunch && launchButton}
          </div>
          {lastError && (
            <p className="mt-2 font-label text-[10px] text-accent-700 break-words" dir="ltr">{lastError}</p>
          )}
        </>
      ) : (
        <>
          <div className={`mt-3 rounded-lg border p-3 ${launchError ? 'border-accent-300 bg-accent-100' : 'border-dashed border-background-300 bg-background-100'}`}>
            {launchError ? (
              <>
                <p className="text-xs font-semibold text-accent-900">{t('awx_job_launch_error')}</p>
                <p className="mt-1 text-xs text-accent-900 break-words" dir={LAUNCH_ERROR[launchError] ? undefined : 'ltr'}>
                  {LAUNCH_ERROR[launchError] ? t(LAUNCH_ERROR[launchError]) : launchError}
                </p>
              </>
            ) : (
              <p className="text-xs text-foreground-700 leading-relaxed">
                {launchBlocked
                  ? t(BLOCK_REASON[launchBlocked] || 'awx_job_no_template')
                  : t(awaitingRequester ? 'awx_job_awaiting_requester' : 'awx_job_none')}
              </p>
            )}
            {lastError && (
              <p className="mt-1.5 font-label text-[10px] text-accent-700 break-words" dir="ltr">{lastError}</p>
            )}
          </div>
          {canLaunch && !launchBlocked && <div className="mt-3">{launchButton}</div>}
        </>
      )}

      {attempts.length > 1 || (attempts.length === 1 && !job) ? (
        <div className="mt-4 pt-3 border-t border-background-200">
          <h3 className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('awx_job_attempts')}</h3>
          <ol className="mt-2 space-y-1.5">
            {attempts.map((attempt) => {
              const isCurrent = Boolean(job && attempt.jobId === job.jobId);
              const showing = attempt.jobId !== null && (outputJobId === attempt.jobId || (isCurrent && outputJobId === null));
              return (
                <li key={attempt.attempt} className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-background-100 px-2.5 py-2">
                  <span className="font-label text-[11px] font-semibold text-foreground-900 whitespace-nowrap">
                    {t('awx_job_attempt', { n: attempt.attempt })}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${badge(attempt.status)}`}>
                    {t(`awx_status_${attempt.status}`, { defaultValue: attempt.status || '—' })}
                  </span>
                  <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 font-label text-[10px] text-foreground-500">
                    {attempt.jobId && <span className="tabular-nums">#{attempt.jobId}</span>}
                    {attempt.launchedBy && <><span aria-hidden="true">·</span><span>{attempt.launchedBy}</span></>}
                    <span aria-hidden="true">·</span><span>{formatDate(attempt.launchedAt, lang)}</span>
                    {attempt.elapsedSec > 0 && <><span aria-hidden="true">·</span><span>{formatDuration(attempt.elapsedSec, lang)}</span></>}
                    {attempt.error && (
                      <span className="basis-full text-accent-700 break-words" dir="ltr">
                        {LAUNCH_ERROR[attempt.error] ? t(LAUNCH_ERROR[attempt.error]) : attempt.error}
                      </span>
                    )}
                  </span>
                  {attempt.jobId && attempt.kind === 'job' && (
                    <button
                      type="button"
                      onClick={() => onShowOutput(isCurrent ? null : attempt.jobId)}
                      aria-pressed={showing}
                      title={t('out_show')}
                      aria-label={t('out_show')}
                      className={`w-6 h-6 flex items-center justify-center rounded-md cursor-pointer ${showing ? 'bg-foreground-950 text-background-50' : 'text-foreground-500 hover:bg-background-200 hover:text-foreground-900'}`}
                    >
                      <i className="ri-terminal-box-line text-xs" aria-hidden="true" />
                    </button>
                  )}
                  {attempt.jobUrl && (
                    <a
                      href={attempt.jobUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={t('awx_job_open')}
                      aria-label={t('awx_job_open')}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                    >
                      <i className="ri-external-link-line text-xs" aria-hidden="true" />
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
