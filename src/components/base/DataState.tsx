import { useTranslation } from 'react-i18next';

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-foreground-500">
      <span className="w-8 h-8 flex items-center justify-center text-primary-500">
        <i className="ri-loader-4-line animate-spin text-2xl" />
      </span>
      <p className="text-sm">{label || t('data_loading')}</p>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center rounded-xl border border-dashed border-accent-300 bg-accent-50/40">
      <span className="w-10 h-10 flex items-center justify-center rounded-full bg-accent-100 text-accent-700">
        <i className="ri-cloud-off-line text-xl" />
      </span>
      <p className="text-sm font-semibold text-foreground-950">{t('data_error_title')}</p>
      <p className="text-xs text-foreground-600 max-w-md">{message || t('data_error_hint')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
      >
        <i className="ri-refresh-line" />
        {t('data_retry')}
      </button>
    </div>
  );
}