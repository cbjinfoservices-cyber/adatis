import { useTranslation } from 'react-i18next';
import type { SystemInfo } from '@/utils/system';
import { formatBytes, shortPostgresVersion } from '@/utils/system';

const DetailRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 py-2 border-b border-background-200 last:border-0">
    <dt className="font-label text-[11px] uppercase tracking-wider text-foreground-500 whitespace-nowrap">{label}</dt>
    <dd
      className={`text-sm text-foreground-900 text-end ${mono ? 'font-label' : ''}`}
      dir={mono ? 'ltr' : undefined}
    >
      {value}
    </dd>
  </div>
);

export default function SystemDatabaseCard({ info }: { info: SystemInfo }) {
  const { t, i18n } = useTranslation();
  const { database, api, tables } = info;

  const dateLabel = (value: string) => new Date(value).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 p-4 md:p-5">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
          <i className="ri-database-2-line" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('sys_db_title')}</h2>
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
            {database.status === 'up' ? t('sys_up') : t('sys_down')}
          </p>
        </div>
        <span className={`ms-auto w-2.5 h-2.5 rounded-full shrink-0 ${database.status === 'up' ? 'bg-primary-500' : 'bg-accent-600'}`} aria-hidden="true" />
      </div>

      {database.status === 'up' ? (
        <>
          <dl className="mt-3">
            <DetailRow label={t('sys_db_version')} value={shortPostgresVersion(database.version)} />
            <DetailRow label={t('sys_db_name')} value={database.name || '—'} mono />
            <DetailRow label={t('sys_db_size')} value={formatBytes(database.sizeBytes)} />
            <DetailRow label={t('sys_db_connections')} value={database.connections === null ? '—' : String(database.connections)} />
            <DetailRow label={t('sys_latency')} value={database.latencyMs === null ? '—' : `${database.latencyMs} ms`} />
          </dl>

          {tables.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('sys_tables_title')}</h3>
                <span className="font-label text-[10px] px-1.5 rounded bg-background-200 text-foreground-600">{tables.length}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {tables.map((table) => (
                  <span
                    key={table.name}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-background-300 bg-background-100 font-label text-[10px] text-foreground-700 whitespace-nowrap"
                    dir="ltr"
                  >
                    {table.name}
                    <span className="text-foreground-500 tabular-nums">{table.rows}</span>
                  </span>
                ))}
              </div>
              <p className="mt-1.5 font-label text-[10px] text-foreground-400">{t('sys_tables_rows')}</p>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-accent-300 bg-accent-50/40 p-3">
          <p className="text-sm font-semibold text-foreground-950">{t('sys_down')}</p>
          <p className="mt-1 text-xs text-foreground-600 break-words" dir="ltr">{database.error || t('sys_error_hint')}</p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-background-200">
        <h3 className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('sys_api_title')}</h3>
        <dl className="mt-1">
          <DetailRow label={t('sys_api_version')} value={api.version} />
          <DetailRow label={t('sys_api_node')} value={api.node} mono />
          <DetailRow label={t('sys_api_env')} value={api.env} mono />
          <DetailRow label={t('sys_api_started')} value={dateLabel(api.startedAt)} />
        </dl>
        <p className="mt-2 text-xs text-foreground-500 leading-relaxed">{t('sys_env_note')}</p>
      </div>
    </section>
  );
}