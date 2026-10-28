import { useTranslation } from 'react-i18next';

/** Aucun connecteur : invitation à en ajouter un (bouton si `onAdd`). */
export function NoConnectors({ onAdd }: { onAdd?: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center">
      <span className="w-12 h-12 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
        <i className="ri-plug-line text-xl" />
      </span>
      <h2 className="mt-2.5 font-heading font-semibold text-foreground-950">{t('admin_empty_title')}</h2>
      <p className="mt-1 text-sm text-foreground-600 max-w-md mx-auto">{t('admin_empty_hint')}</p>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line" />{t('admin_add')}
        </button>
      )}
    </section>
  );
}

/** Des connecteurs existent, mais aucun ne correspond aux filtres. */
export function NoMatchingConnectors({ search, retestOnly, onReset }: {
  search: string;
  retestOnly: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const searching = search.trim() !== '';
  return (
    <div className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center">
      <span className="w-11 h-11 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
        <i className={searching ? 'ri-search-line' : retestOnly ? 'ri-alert-line' : 'ri-filter-off-line'} />
      </span>
      <p className="mt-2 text-sm text-foreground-600">
        {searching
          ? t('admin_search_empty')
          : retestOnly
            ? t('admin_retest_filter_empty')
            : t('admin_health_filter_empty')}
      </p>
      {(searching || retestOnly) && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100"
        >
          <i className="ri-close-line" />{t('admin_health_filter_clear')}
        </button>
      )}
    </div>
  );
}
