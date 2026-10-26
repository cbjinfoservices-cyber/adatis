import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdapterItem } from '@/utils/store';

export default function DeleteAdapterModal({
  adapter, connectors, onClose, onConfirm,
}: {
  adapter: AdapterItem | null;
  connectors: number;
  onClose: () => void;
  onConfirm: (adapter: AdapterItem) => void;
}) {
  const { t } = useTranslation();
  const blocked = connectors > 0;

  useEffect(() => {
    if (!adapter) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adapter, onClose]);

  if (!adapter) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label={t('adapt_close')} onClick={onClose} className="absolute inset-0 bg-foreground-950/50 cursor-pointer" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-lg rounded-2xl bg-background-50 border border-background-200 shadow-xl">
        <header className="p-5 border-b border-background-200 flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-accent-100 text-accent-900 flex items-center justify-center shrink-0">
            <i className="ri-delete-bin-6-line text-lg" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold text-foreground-950">
              {t('adapt_delete_title', { name: adapter.name })}
            </h2>
            <p className="mt-1 text-xs text-foreground-600">{t('adapt_delete_hint')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('adapt_close')} className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-600 hover:bg-background-200 cursor-pointer shrink-0">
            <i className="ri-close-line" />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl border border-background-200 bg-background-100">
            <span className="w-9 h-9 rounded-lg bg-background-50 border border-background-200 flex items-center justify-center text-foreground-800 shrink-0">
              <i className={`${adapter.icon || 'ri-plug-line'} text-base`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground-950 truncate">{adapter.name}</p>
              <p className="mt-0.5 font-label text-[11px] text-foreground-600 truncate" dir="ltr">{adapter.kind}</p>
            </div>
          </div>
          {blocked ? (
            <p className="inline-flex items-start gap-1.5 text-xs text-accent-700">
              <i className="ri-error-warning-line mt-0.5" />
              {t('adapt_delete_blocked', { count: connectors })}
            </p>
          ) : (
            <p className="inline-flex items-start gap-1.5 text-xs text-foreground-600">
              <i className="ri-information-line mt-0.5" />{t('adapt_delete_free')}
            </p>
          )}
        </div>

        <footer className="p-5 border-t border-background-200 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-background-300 text-sm font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-200">
            {t('adapt_cancel')}
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => onConfirm(adapter)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-700 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-delete-bin-6-line" />{t('adapt_delete_confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}