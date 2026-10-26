import { useTranslation } from 'react-i18next';
import useReadOnly from '@/hooks/useReadOnly';
import { tx } from '@/utils/catalog';
import type { AdapterItem } from '@/utils/store';

export default function AdapterCard({
  adapter, connectors, onEdit, onDelete,
}: {
  adapter: AdapterItem;
  connectors: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const readOnly = useReadOnly();
  const description = tx(adapter.description, i18n.language);

  return (
    <article className="p-4 rounded-xl bg-background-50 border border-background-200 flex flex-col gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-10 h-10 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
          <i className={`${adapter.icon || 'ri-plug-line'} text-lg`} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-sm font-semibold text-foreground-950 truncate">{adapter.name}</h3>
          <p className="font-label text-[10px] text-foreground-500 truncate" dir="ltr">{adapter.kind}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap shrink-0 ${connectors > 0
          ? 'bg-secondary-100 text-secondary-800 dark:text-secondary-900'
          : 'bg-background-200 text-foreground-600'}`}
        >
          <i className={connectors > 0 ? 'ri-links-line' : 'ri-link-unlink'} />
          {connectors > 0 ? t('adapt_used_by', { count: connectors }) : t('adapt_unused')}
        </span>
      </div>

      <p className={`text-xs leading-relaxed line-clamp-3 ${description ? 'text-foreground-700' : 'text-foreground-400 italic'}`}>
        {description || t('adapt_desc_missing')}
      </p>

      <div className="mt-auto pt-2 flex items-center gap-1.5 border-t border-background-200">
        <button
          type="button"
          onClick={onEdit}
          disabled={readOnly}
          title={readOnly ? t('admin_readonly_action') : undefined}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-pencil-line" />{t('adapt_edit_short')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={readOnly}
          aria-label={t('adapt_delete', { name: adapter.name })}
          title={readOnly ? t('admin_readonly_action') : t('adapt_delete', { name: adapter.name })}
          className="ms-auto inline-flex items-center justify-center w-8 h-8 rounded-lg border border-background-300 text-foreground-600 whitespace-nowrap cursor-pointer hover:bg-accent-100 hover:text-accent-900 hover:border-accent-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-delete-bin-line text-sm" />
        </button>
      </div>
    </article>
  );
}