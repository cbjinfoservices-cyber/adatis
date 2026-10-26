import { useTranslation } from 'react-i18next';
import type { SystemMigration } from '@/utils/system';

export default function SystemMigrationsTable({
  migrations, checkedAt, onExport,
}: {
  migrations: SystemMigration[];
  checkedAt: string;
  onExport: () => void;
}) {
  const { t, i18n } = useTranslation();

  const stamp = (value: string) => new Date(value).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <header className="p-4 md:p-5 border-b border-background-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-secondary-100 text-secondary-800 dark:text-secondary-900 flex items-center justify-center shrink-0">
            <i className="ri-node-tree" />
          </span>
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('sys_migrations_title')}</h2>
          <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-600 whitespace-nowrap">
            {t('sys_migrations_count', { count: migrations.length })}
          </span>
          <span className="ms-auto font-label text-[10px] text-foreground-500 whitespace-nowrap">
            {t('sys_checked_at', { date: stamp(checkedAt) })}
          </span>
          <button
            type="button"
            onClick={onExport}
            disabled={migrations.length === 0}
            title={t('sys_mig_export')}
            aria-label={t('sys_mig_export')}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-background-300 bg-background-50 text-foreground-700 cursor-pointer hover:bg-background-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-download-2-line text-sm" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-foreground-600">{t('sys_migrations_hint')}</p>
      </header>

      {migrations.length === 0 ? (
        <div className="p-6 text-center">
          <span className="w-11 h-11 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
            <i className="ri-file-list-3-line" />
          </span>
          <p className="mt-2 text-sm text-foreground-600">{t('sys_migrations_empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-background-100 text-foreground-600">
                <th scope="col" className="text-start font-label text-[10px] uppercase tracking-widest px-4 py-2 whitespace-nowrap">
                  {t('sys_migrations_col_version')}
                </th>
                <th scope="col" className="text-start font-label text-[10px] uppercase tracking-widest px-4 py-2 whitespace-nowrap">
                  {t('sys_migrations_col_date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {migrations.map((migration) => (
                <tr key={migration.version} className="border-t border-background-200">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 font-label text-xs text-foreground-900" dir="ltr">
                      <i className="ri-checkbox-circle-fill text-primary-500" />
                      {migration.version}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground-700 whitespace-nowrap">
                    {stamp(migration.applied_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}