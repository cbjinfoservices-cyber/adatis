import { useTranslation } from 'react-i18next';
import { endpointIsOriginal, type Connector } from '@/utils/connectors';
import type { EndpointEditor } from '@/pages/admin/connectors/components/detail/useEndpointEditor';

const SECONDARY_BUTTON = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed';

/** URL du connecteur : saisie, enregistrement, retour à l'origine et test de connexion. */
export default function EndpointCard({ connector, editor }: { connector: Connector; editor: EndpointEditor }) {
  const { t } = useTranslation();
  const managed = Boolean(connector.managed);
  const { endpoint, error, testResult } = editor;

  return (
    <div className="rounded-lg bg-background-100 border border-background-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`endpoint-${connector.id}`} className="font-label text-[10px] uppercase tracking-wider text-foreground-500">
          {t('admin_endpoint')}
        </label>
        {editor.dirty && (
          <span className="font-label text-[10px] px-2 py-0.5 rounded-md bg-accent-100 text-accent-900 whitespace-nowrap">
            {t('admin_endpoint_unsaved')}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-foreground-600">
        {managed ? t('admin_managed_endpoint_hint') : t('admin_endpoint_hint')}
      </p>
      <div className="mt-2 space-y-2">
        <input
          id={`endpoint-${connector.id}`}
          type="url"
          dir="ltr"
          value={endpoint}
          readOnly={managed}
          placeholder={t('admin_endpoint_placeholder')}
          onChange={(e) => editor.edit(e.target.value)}
          className="block w-full min-w-0 box-border px-3 py-2 rounded-lg border border-background-300 bg-background-50 font-label text-[12px] text-foreground-950 read-only:bg-background-100 read-only:text-foreground-700 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
        />
        <div className="flex flex-wrap items-center gap-2">
          {!managed && (
            <>
              <button type="button" onClick={editor.save} disabled={!editor.dirty} className={SECONDARY_BUTTON}>
                <i className="ri-save-3-line" />{t('admin_endpoint_save')}
              </button>
              <button
                type="button"
                onClick={() => editor.setConfirmReset(true)}
                disabled={endpointIsOriginal(connector, endpoint) || editor.confirmReset}
                className={SECONDARY_BUTTON}
              >
                <i className="ri-arrow-go-back-line" />{t('admin_endpoint_reset')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={editor.test}
            disabled={editor.testing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed sm:ms-auto"
          >
            <i className={editor.testing ? 'ri-loader-4-line animate-spin' : 'ri-plug-line'} />
            {editor.testing ? t('admin_endpoint_testing') : t('admin_endpoint_test')}
          </button>
        </div>
      </div>
      {editor.confirmReset && (
        <div className="mt-2 rounded-lg border border-accent-300 bg-accent-100/70 p-2.5">
          <p className="text-xs font-semibold text-foreground-950">{t('admin_endpoint_reset_confirm_title')}</p>
          <p className="mt-0.5 text-[11px] text-foreground-700">{t('admin_endpoint_reset_confirm_hint')}</p>
          <p className="mt-1 font-label text-[10px] text-foreground-600 truncate" dir="ltr" title={connector.endpointDefault}>
            {connector.endpointDefault}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={editor.reset}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-background-50 dark:text-foreground-950 text-[11px] font-semibold whitespace-nowrap cursor-pointer"
            >
              <i className="ri-arrow-go-back-line" />{t('admin_endpoint_reset_confirm_ok')}
            </button>
            <button
              type="button"
              onClick={() => editor.setConfirmReset(false)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-background-300 bg-background-50 text-[11px] font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100"
            >
              <i className="ri-close-line" />{t('admin_endpoint_reset_confirm_cancel')}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-accent-700">
          <i className="ri-error-warning-line" />{error}
        </p>
      )}
      {!error && testResult && (
        <div className={`mt-1.5 text-xs ${testResult.ok ? 'text-primary-700 dark:text-primary-300' : 'text-accent-700'}`}>
          <p className="inline-flex items-center gap-1.5">
            <i className={testResult.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} />
            {testResult.ok
              ? t('admin_endpoint_test_ok', { ms: testResult.latency })
              : t('admin_endpoint_test_fail')}
          </p>
          {testResult.error && (
            <p className="mt-0.5 font-label text-[10px] break-all" dir="ltr">{testResult.error}</p>
          )}
        </div>
      )}
      {!endpointIsOriginal(connector, endpoint) && (
        <p className="mt-1.5 flex items-start gap-1 font-label text-[10px] text-foreground-500 min-w-0">
          <i className="ri-history-line shrink-0 mt-px" />
          <span className="truncate">{t('admin_endpoint_original')} · <span dir="ltr">{connector.endpointDefault}</span></span>
        </p>
      )}
    </div>
  );
}
