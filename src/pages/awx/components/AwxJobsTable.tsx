import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AWX_STATUS_STYLE, formatDate, formatDuration } from '@/utils/executions';
import { tx } from '@/utils/catalog';
import { KIND_ICON, kindLabel, type ConnectorKind } from '@/utils/connectors';
import { engineOf, LAUNCH_FAILED, NOT_WIRED, type AwxJobRow } from '@/utils/awxJobs';

const KIND_STYLE: Record<string, string> = {
  workflow: 'bg-secondary-100 text-secondary-900',
  job: 'bg-background-200 text-foreground-700',
};

const NEUTRAL = 'bg-background-200 text-foreground-600';

/**
 * Une ligne par demande routée vers un moteur : job Ascender lancé, lancement
 * refusé par Ascender, ou demande destinée à un moteur pas encore branché.
 */
export default function AwxJobsTable({ rows }: { rows: AwxJobRow[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <div className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="text-left font-label text-[10px] uppercase tracking-widest text-foreground-500 bg-background-100">
              <th className="px-4 py-3">{t('awx_track_col_job')}</th>
              <th className="px-4 py-3">{t('awx_track_col_kind')}</th>
              <th className="px-4 py-3">{t('awx_track_col_request')}</th>
              <th className="px-4 py-3">{t('awx_track_col_user')}</th>
              <th className="px-4 py-3">{t('awx_track_col_status')}</th>
              <th className="px-4 py-3">{t('awx_track_col_started')}</th>
              <th className="px-4 py-3">{t('awx_track_col_duration')}</th>
              <th className="px-4 py-3 text-end">{t('awx_track_col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-200">
            {rows.map((row) => {
              const job = row.awx;
              const engine = engineOf(row);
              const notWired = row.portalStatus === NOT_WIRED;
              let statusKey = '';
              let statusLabel = '—';
              if (job?.status) {
                statusKey = job.status;
                statusLabel = t(`awx_status_${job.status}`, { defaultValue: job.status });
              } else if (row.awxStatus === LAUNCH_FAILED) {
                statusKey = LAUNCH_FAILED;
                statusLabel = t('awx_status_launch_failed');
              } else if (notWired) {
                statusLabel = t('status_not_wired');
              }
              const style = AWX_STATUS_STYLE[statusKey] || NEUTRAL;
              const isRunning = statusKey === 'running';
              return (
                <tr key={`${row.id}-${job?.jobId ?? 'none'}`} className="hover:bg-background-100/70 transition-colors align-top">
                  <td className="px-4 py-3">
                    {job ? (
                      <>
                        <span className="block font-label text-sm font-semibold text-foreground-950 tabular-nums">#{job.jobId}</span>
                        <span className="mt-0.5 block text-[11px] text-foreground-500 truncate max-w-[200px]" title={job.templateName}>
                          {job.templateName || (job.templateId ? `#${job.templateId}` : '—')}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block font-label text-sm text-foreground-500">—</span>
                        {row.launchError && (
                          <span className="mt-0.5 block text-[11px] text-accent-700 truncate max-w-[200px]" title={row.launchError} dir="ltr">
                            {row.launchError}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {job ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${KIND_STYLE[row.jobKind] || KIND_STYLE.job}`}>
                        <i className={row.jobKind === 'workflow' ? 'ri-git-branch-line' : 'ri-play-circle-line'} aria-hidden="true" />
                        {t(row.jobKind === 'workflow' ? 'awx_track_kind_workflow' : 'awx_track_kind_job')}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${NEUTRAL}`}>
                        <i className={KIND_ICON[engine as ConnectorKind] || 'ri-plug-line'} aria-hidden="true" />
                        {row.engine?.connectorName || kindLabel(engine)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 min-w-0">
                    <Link to={`/requests/${row.id}`} className="block font-medium text-foreground-950 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer truncate max-w-[240px]">
                      {tx(row.service, lang)}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-label text-[10px] uppercase tracking-wider text-foreground-500">
                      <span>{row.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{row.environment}</span>
                      <span aria-hidden="true">·</span>
                      <span className="normal-case tracking-normal truncate max-w-[120px]">{row.tenant}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-label text-[10px] shrink-0">{row.initials}</span>
                      <span className="min-w-0">
                        <span className="block text-foreground-900 text-xs truncate max-w-[150px]">{job?.launchedBy || row.user}</span>
                        {job?.launchedBy && job.launchedBy !== row.user && (
                          <span className="block text-[10px] text-foreground-500 truncate max-w-[150px]">{row.user}</span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[11px] whitespace-nowrap ${style}`}>
                      <i className={isRunning ? 'ri-loader-4-line animate-spin' : 'ri-circle-fill text-[6px]'} aria-hidden="true" />
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-600 whitespace-nowrap">
                    <span className="block">{formatDate(job?.startedAt || row.createdAt, lang)}</span>
                    {job?.finishedAt && (
                      <span className="mt-0.5 block text-[11px] text-foreground-500">→ {formatDate(job.finishedAt, lang)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-700 whitespace-nowrap tabular-nums">
                    {job && row.durationSec > 0 ? formatDuration(row.durationSec, lang) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {job?.jobUrl && (
                        <a
                          href={job.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={t('awx_track_open')}
                          aria-label={t('awx_track_open')}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-background-300 text-foreground-700 hover:bg-primary-500 hover:text-background-50 hover:border-primary-500 transition-colors cursor-pointer"
                        >
                          <i className="ri-external-link-line" aria-hidden="true" />
                        </a>
                      )}
                      <Link
                        to={`/requests/${row.id}`}
                        title={t('awx_track_view_request')}
                        aria-label={t('awx_track_view_request')}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-background-300 text-foreground-700 hover:bg-foreground-950 hover:text-background-50 hover:border-foreground-950 transition-colors cursor-pointer"
                      >
                        <i className="ri-arrow-right-line" aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
