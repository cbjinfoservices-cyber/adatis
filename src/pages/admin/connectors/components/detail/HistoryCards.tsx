import { useTranslation } from 'react-i18next';
import { csvFileName, testsToCsv, type Connector } from '@/utils/connectors';
import { localeOf } from '@/utils/catalog';
import { downloadCsv } from '@/utils/download';
import type { BatchTestEntry } from '@/utils/store';
import { formatDetailDate } from '@/pages/admin/connectors/components/detail/formatDate';

const CARD = 'rounded-lg bg-background-100 border border-background-200 p-3';
const OK_TONE = 'text-primary-700 dark:text-primary-300';

/** Quatre derniers tests de connexion, avec export CSV de tout l'historique. */
export function TestHistoryCard({ connector, onNotify }: { connector: Connector; onNotify: (message: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const exportTests = () => {
    if (connector.tests.length === 0) return;
    const csv = testsToCsv(connector, {
      date: t('csv_test_date'),
      status: t('csv_test_status'),
      latency: t('csv_test_latency'),
      error: t('csv_test_error'),
      ok: t('admin_check_ok'),
      fail: t('admin_test_fail_label'),
      connector: t('csv_meta_connector'),
      endpoint: t('csv_meta_endpoint'),
      notes: t('csv_meta_notes'),
      lastTest: t('admin_test_last'),
    }, localeOf(lang));
    const file = csvFileName(connector);
    downloadCsv(file, csv);
    onNotify(t('admin_test_export_done', { file }));
  };

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-semibold text-sm text-foreground-950">{t('admin_test_history')}</h3>
        <div className="flex items-center gap-2">
          <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
            {connector.tests.length}
          </span>
          <button
            type="button"
            onClick={exportTests}
            disabled={connector.tests.length === 0}
            title={t('admin_test_export')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 bg-background-50 text-[11px] font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-download-2-line" />{t('admin_test_export')}
          </button>
        </div>
      </div>
      {connector.tests.length === 0 ? (
        <p className="mt-1.5 font-label text-[11px] text-foreground-500">{t('admin_test_history_empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-background-200">
          {connector.tests.slice(0, 4).map((entry) => (
            <li key={`${entry.at}-${entry.latency}`} className="py-1.5 flex items-start gap-2 min-w-0">
              <span className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 ${entry.ok ? OK_TONE : 'text-accent-700'}`}>
                <i className={entry.ok ? 'ri-checkbox-circle-line' : 'ri-close-circle-line'} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-label text-[11px] text-foreground-800">
                  {entry.ok ? `OK · ${entry.latency} ms` : t('admin_test_fail_label')}
                </p>
                {entry.error && (
                  <p className="font-label text-[10px] text-accent-700 truncate" title={entry.error} dir="ltr">{entry.error}</p>
                )}
              </div>
              <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">{formatDetailDate(entry.at, lang)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CHANGES_SHOWN = 6;

/** Journal des modifications (nom, URL, notes, import) du connecteur. */
export function ChangeHistoryCard({ connector }: { connector: Connector }) {
  const { t, i18n } = useTranslation();
  const history = connector.history || [];
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-semibold text-sm text-foreground-950">{t('admin_history_title')}</h3>
        <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
          {t('admin_history_count', { count: history.length })}
        </span>
      </div>
      <p className="mt-0.5 font-label text-[10px] text-foreground-500">{t('admin_history_hint')}</p>
      {history.length === 0 ? (
        <p className="mt-1.5 font-label text-[11px] text-foreground-500">{t('admin_history_empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-background-200">
          {history.slice(0, CHANGES_SHOWN).map((change) => (
            <li key={`${change.at}-${change.field}`} className="py-2 min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="font-label text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background-200 text-foreground-700 whitespace-nowrap">
                  {t(`admin_history_field_${change.field}`)}
                </span>
                <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">{formatDetailDate(change.at, i18n.language)}</span>
                <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
                  · {t('admin_history_by', { author: change.author })}
                </span>
              </div>
              {change.field !== 'import' && (
                <p className="mt-1 min-w-0 font-label text-[11px] text-foreground-700 break-words" dir="ltr">
                  <span className="text-foreground-500 line-through">{change.before || '—'}</span>
                  <span className="mx-1 text-foreground-500">→</span>
                  <span className="text-foreground-900">{change.after || '—'}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {history.length > CHANGES_SHOWN && (
        <p className="mt-1 font-label text-[10px] text-foreground-500">
          {t('admin_history_more', { count: history.length - CHANGES_SHOWN })}
        </p>
      )}
    </div>
  );
}

/** Évolution de la latence moyenne entre deux retests groupés (±5 % = stable). */
const latencyTrend = (run: BatchTestEntry, older?: BatchTestEntry) => {
  const diff = older && older.avgLatencyMs > 0
    ? Math.round(((run.avgLatencyMs - older.avgLatencyMs) / older.avgLatencyMs) * 100)
    : null;
  if (diff === null) return null;
  if (diff <= -5) return { trend: 'faster', diff, tone: OK_TONE, icon: 'ri-arrow-down-line' } as const;
  if (diff >= 5) return { trend: 'slower', diff, tone: 'text-accent-700', icon: 'ri-arrow-up-line' } as const;
  return { trend: 'equal', diff, tone: 'text-foreground-500', icon: 'ri-subtract-line' } as const;
};

/** Trois derniers retests groupés, avec tendance de latence. */
export function BatchHistoryCard({ batchHistory }: { batchHistory: BatchTestEntry[] }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={`mt-4 ${CARD}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading font-semibold text-sm text-foreground-950">{t('admin_batch_history_title')}</h3>
      </div>
      <p className="mt-0.5 font-label text-[10px] text-foreground-500 leading-relaxed">{t('admin_batch_history_hint')}</p>
      {batchHistory.length === 0 ? (
        <p className="mt-1.5 font-label text-[11px] text-foreground-500">{t('admin_batch_history_empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-background-200">
          {batchHistory.slice(0, 3).map((run, index) => {
            const trend = latencyTrend(run, batchHistory[index + 1]);
            return (
              <li key={`${run.at}-${index}`} className="py-1.5 flex items-start gap-2 min-w-0">
                <span className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 ${run.failed > 0 ? 'text-accent-700' : OK_TONE}`}>
                  <i className={run.failed > 0 ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-label text-[11px] text-foreground-900 truncate">
                    {t('admin_batch_history_meta', { count: run.total, ok: run.ok })}
                  </p>
                  <p className="font-label text-[10px] text-foreground-500 truncate">
                    {formatDetailDate(run.at, i18n.language)}
                    {run.failed > 0 && (
                      <span className="text-accent-700"> · {t('admin_batch_history_failed', { count: run.failed })}</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="font-label text-[11px] font-semibold text-foreground-900 tabular-nums">{run.avgLatencyMs} ms</p>
                  {trend && (
                    <p className={`font-label text-[10px] whitespace-nowrap ${trend.tone}`}>
                      <i className={`${trend.icon} me-0.5`} />
                      {t(`admin_batch_history_${trend.trend}`)}
                      {trend.trend !== 'equal' ? ` ${Math.abs(trend.diff)}%` : ''}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
