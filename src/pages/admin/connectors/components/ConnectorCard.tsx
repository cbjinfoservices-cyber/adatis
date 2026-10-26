import { useTranslation } from 'react-i18next';
import useReadOnly from '@/hooks/useReadOnly';
import {
  HEALTH_STYLE, KIND_ICON, publishedCount, type Connector,
} from '@/utils/connectors';
import { localeOf } from '@/utils/catalog';

export default function ConnectorCard({
  connector, active, testing, syncing, onSelect, onTest, onSync, onDuplicate, onDelete,
}: {
  connector: Connector;
  active: boolean;
  testing: boolean;
  syncing: boolean;
  onSelect: () => void;
  onTest: () => void;
  onSync: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const readOnly = useReadOnly();
  const lang = i18n.language;
  const health = HEALTH_STYLE[connector.health];
  const lastTest = connector.tests.length > 0 ? connector.tests[0] : null;
  const failure = connector.tests.find((entry) => !entry.ok) || null;

  const formatStamp = (value: string) =>
    new Date(value).toLocaleString(localeOf(lang), {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  const lastSync = connector.lastSync ? formatStamp(connector.lastSync) : t('admin_never');

  return (
    <article
      className={`rounded-xl bg-background-50 border transition-colors ${active ? 'border-primary-400 ring-1 ring-primary-400/40' : 'border-background-200 hover:border-foreground-300'}`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left p-4 cursor-pointer rounded-t-xl">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-background-100 border border-background-200 flex items-center justify-center text-foreground-800 shrink-0">
            <i className={`${KIND_ICON[connector.kind] || 'ri-plug-line'} text-lg`} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-heading font-semibold text-foreground-950 truncate">{connector.name}</h3>
                <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{connector.kind}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap shrink-0 ${health.badge}`}>
                <i className={health.icon} />
                {t(`admin_health_${connector.health}`)}
              </span>
            </div>
            <p className="mt-2 font-label text-[11px] text-foreground-600 truncate" dir="ltr">{connector.endpoint}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <span className="font-label text-[9px] uppercase tracking-wider text-foreground-500 whitespace-nowrap">
                {t('admin_test_last')}
              </span>
              {lastTest ? (
                <span className={`inline-flex items-center gap-1 font-label text-[10px] whitespace-nowrap ${lastTest.ok ? 'text-primary-700 dark:text-primary-300' : 'text-accent-700'}`}>
                  <i className={lastTest.ok ? 'ri-checkbox-circle-line' : 'ri-close-circle-line'} />
                  {formatStamp(lastTest.at)}
                  {lastTest.ok ? ` · ${lastTest.latency} ms` : ` · ${t('admin_test_fail_label')}`}
                </span>
              ) : (
                <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">{t('admin_test_never')}</span>
              )}
              {connector.retestRequiredAt && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-100 text-accent-900 font-label text-[9px] whitespace-nowrap">
                  <i className="ri-alert-line" />{t('admin_retest_badge')}
                </span>
              )}
            </div>
            {failure?.error && (
              <p className="mt-1 flex items-start gap-1 min-w-0 font-label text-[10px] text-accent-700" title={failure.error}>
                <i className="ri-error-warning-line shrink-0 mt-px" />
                <span className="truncate">
                  <span className="text-foreground-500">{t('admin_test_last_error')} · </span>{failure.error}
                </span>
              </p>
            )}
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {[
                { k: t('admin_latency'), v: connector.latencyMs ? `${connector.latencyMs} ms` : '—' },
                { k: t('admin_services'), v: `${publishedCount(connector)}/${connector.catalog.length}` },
                { k: t('admin_jobs_24'), v: `${connector.jobs24h}` },
              ].map((m) => (
                <div key={m.k} className="min-w-0">
                  <dt className="font-label text-[9px] uppercase tracking-wider text-foreground-500 truncate">{m.k}</dt>
                  <dd className="text-sm font-semibold text-foreground-900 truncate">{m.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </button>
      <div className="px-4 pb-3.5 flex flex-wrap items-center gap-2 border-t border-background-200 pt-2.5">
        <span className="font-label text-[10px] text-foreground-500 truncate">
          {t('admin_last_sync')} · {lastSync}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={readOnly}
            title={t('admin_duplicate_aria', { name: connector.name })}
            aria-label={t('admin_duplicate_aria', { name: connector.name })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-background-300 text-foreground-600 whitespace-nowrap cursor-pointer hover:bg-background-100 hover:text-foreground-900"
          >
            <i className="ri-file-copy-line" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={testing || syncing || readOnly}
            title={t('admin_delete_aria', { name: connector.name })}
            aria-label={t('admin_delete_aria', { name: connector.name })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-background-300 text-foreground-600 whitespace-nowrap cursor-pointer hover:bg-accent-100 hover:text-accent-900 hover:border-accent-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-delete-bin-6-line" />
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={testing || syncing || readOnly}
            title={readOnly ? t('admin_readonly_action') : undefined}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-background-300 text-xs font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={testing ? 'ri-loader-4-line animate-spin' : 'ri-pulse-line'} />
            {testing ? t('admin_testing') : t('admin_test')}
          </button>
          <button
            type="button"
            onClick={onSync}
            disabled={testing || syncing || readOnly}
            title={readOnly ? t('admin_readonly_action') : undefined}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={syncing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
            {syncing ? t('admin_syncing') : t('admin_sync')}
          </button>
        </div>
      </div>
    </article>
  );
}