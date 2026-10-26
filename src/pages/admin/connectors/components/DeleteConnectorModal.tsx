import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { KIND_ICON, publishedCount, type Connector } from '@/utils/connectors';

export default function DeleteConnectorModal({
  connector, onClose, onConfirm,
}: {
  connector: Connector | null;
  onClose: () => void;
  onConfirm: (connector: Connector) => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!connector) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connector, onClose]);

  if (!connector) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('admin_close')}
        onClick={onClose}
        className="absolute inset-0 bg-foreground-950/50 cursor-pointer"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-connector-title"
        className="relative w-full max-w-lg rounded-2xl bg-background-50 border border-background-200 shadow-xl"
      >
        <header className="p-5 border-b border-background-200 flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-accent-100 text-accent-900 flex items-center justify-center shrink-0">
            <i className="ri-delete-bin-6-line text-lg" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="delete-connector-title" className="font-heading text-lg font-bold text-foreground-950">
              {t('admin_delete_title', { name: connector.name })}
            </h2>
            <p className="mt-1 text-xs text-foreground-600">{t('admin_delete_hint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('admin_close')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-600 hover:bg-background-200 cursor-pointer shrink-0"
          >
            <i className="ri-close-line" />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl border border-background-200 bg-background-100">
            <span className="w-9 h-9 rounded-lg bg-background-50 border border-background-200 flex items-center justify-center text-foreground-800 shrink-0">
              <i className={`${KIND_ICON[connector.kind] || 'ri-plug-line'} text-base`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground-950 truncate">{connector.name}</p>
              <p className="mt-0.5 font-label text-[11px] text-foreground-600 truncate" dir="ltr">{connector.endpoint}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0 p-2.5 rounded-lg border border-background-200">
              <dt className="font-label text-[10px] uppercase tracking-wider text-foreground-500 truncate">{t('admin_services')}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground-900">
                {publishedCount(connector)}/{connector.catalog.length}
              </dd>
            </div>
            <div className="min-w-0 p-2.5 rounded-lg border border-background-200">
              <dt className="font-label text-[10px] uppercase tracking-wider text-foreground-500 truncate">{t('admin_test_history')}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground-900">{connector.tests.length}</dd>
            </div>
          </dl>
        </div>

        <footer className="p-5 border-t border-background-200 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-background-300 text-sm font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-200"
          >
            {t('admin_delete_cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(connector)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-700 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
          >
            <i className="ri-delete-bin-6-line" />{t('admin_delete_confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}