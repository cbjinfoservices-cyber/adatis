import { useTranslation } from 'react-i18next';
import type { EndpointEditor } from '@/pages/admin/connectors/components/detail/useEndpointEditor';
import { formatDetailDate } from '@/pages/admin/connectors/components/detail/formatDate';

interface Props {
  retestRequiredAt: string;
  retestCount: number;
  testingAll: boolean;
  readOnly: boolean;
  editor: EndpointEditor;
  onTestAllRetest: () => void;
}

/** Bandeau du connecteur à retester (après un changement de configuration). */
export default function RetestBanner({ retestRequiredAt, retestCount, testingAll, readOnly, editor, onTestAllRetest }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <div className="border-b border-accent-300 bg-accent-100/70 px-4 md:px-5 py-3 flex flex-wrap items-center gap-3">
      <span className="w-8 h-8 rounded-lg bg-accent-500 text-background-50 dark:text-foreground-950 flex items-center justify-center shrink-0">
        <i className="ri-alert-line" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground-950">{t('admin_retest_title')}</p>
        <p className="mt-0.5 text-[11px] text-foreground-700">{t('admin_retest_hint')}</p>
        <p className="mt-0.5 font-label text-[10px] text-foreground-500">
          {t('admin_retest_since', { date: formatDetailDate(retestRequiredAt, i18n.language) })}
        </p>
      </div>
      <button
        type="button"
        onClick={onTestAllRetest}
        disabled={testingAll || retestCount === 0 || readOnly}
        title={t('admin_retest_all')}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-accent-400 bg-background-50 text-accent-900 text-xs font-semibold whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <i className={testingAll ? 'ri-loader-4-line animate-spin' : 'ri-play-circle-line'} />
        {testingAll ? t('admin_retest_all_running') : t('admin_retest_all_short')}
        {!testingAll && (
          <span className="font-label text-[10px] px-1 rounded bg-accent-500/20">{retestCount}</span>
        )}
      </button>
      <button
        type="button"
        onClick={editor.test}
        disabled={editor.testing || readOnly}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-600 hover:bg-accent-700 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <i className={editor.testing ? 'ri-loader-4-line animate-spin' : 'ri-pulse-line'} />
        {editor.testing ? t('admin_endpoint_testing') : t('admin_retest_action')}
      </button>
    </div>
  );
}
