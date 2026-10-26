import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useReadOnly from '@/hooks/useReadOnly';
import {
  HEALTH_STYLE, KIND_ICON, MAP_STYLE, endpointIsValid, endpointIsOriginal, csvFileName, downloadCsv, publishedCount, reviewCount, testsToCsv,
  type Connector, type ConnectorTestEntry,
} from '@/utils/connectors';
import { localeOf, tx } from '@/utils/catalog';
import type { BatchTestEntry } from '@/utils/store';

export default function ConnectorDetail({
  connector, retestCount, testingAll, onTestAllRetest, batchHistory,
  onToggleMap, onUpdateEndpoint, onEndpointTested, onRename, onNotes, onDuplicate, onNotify, onDelete,
}: {
  connector: Connector;
  retestCount: number;
  batchHistory: BatchTestEntry[];
  testingAll: boolean;
  onTestAllRetest: () => void;
  onToggleMap: (itemId: string) => void;
  onUpdateEndpoint: (endpoint: string) => void;
  onEndpointTested: (endpoint: string, result: ConnectorTestEntry) => void;
  onRename: (name: string) => void;
  onNotes: (notes: string) => void;
  onDuplicate: () => void;
  onNotify: (message: string) => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const readOnly = useReadOnly();
  const lang = i18n.language;
  const health = HEALTH_STYLE[connector.health];

  const [endpoint, setEndpoint] = useState(connector.endpoint);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency: number; error: string | null } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(connector.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState(connector.notes || '');
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    setEndpoint(connector.endpoint);
    setEndpointError(null);
    setTestResult(null);
    setConfirmReset(false);
    setRenaming(false);
    setNameDraft(connector.name);
    setNameError(null);
    setNotesDraft(connector.notes || '');
    setNotesError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector.id]);

  const endpointDirty = endpoint.trim() !== connector.endpoint.trim();
  const notesDirty = notesDraft.trim() !== (connector.notes || '').trim();
  const history = connector.history || [];

  const saveNotes = () => {
    if (readOnly) return;
    const next = notesDraft.trim();
    if (next.length > 500) {
      setNotesError(t('admin_notes_max', { count: 500 }));
      return;
    }
    setNotesError(null);
    setNotesDraft(next);
    onNotes(next);
    onNotify(t('admin_notes_saved', { name: connector.name }));
  };

  const saveEndpoint = () => {
    if (readOnly) return;
    const next = endpoint.trim();
    if (!endpointIsValid(next)) {
      setEndpointError(t('admin_endpoint_invalid'));
      setTestResult(null);
      return;
    }
    setEndpointError(null);
    setTestResult(null);
    setEndpoint(next);
    onUpdateEndpoint(next);
    onNotify(t('admin_endpoint_saved', { name: connector.name }));
  };

  const resetEndpoint = () => {
    if (readOnly) return;
    setEndpoint(connector.endpointDefault);
    setEndpointError(null);
    setTestResult(null);
    setConfirmReset(false);
    onUpdateEndpoint(connector.endpointDefault);
    onNotify(t('admin_endpoint_reset_done', { name: connector.name }));
  };

  const startRename = () => {
    if (readOnly) return;
    setNameDraft(connector.name);
    setNameError(null);
    setRenaming(true);
  };

  const cancelRename = () => {
    setRenaming(false);
    setNameError(null);
    setNameDraft(connector.name);
  };

  const submitRename = () => {
    if (readOnly) return;
    const next = nameDraft.trim();
    if (!next) {
      setNameError(t('admin_rename_empty'));
      return;
    }
    if (next === connector.name) {
      cancelRename();
      return;
    }
    setNameError(null);
    setRenaming(false);
    onRename(next);
  };

  const testEndpoint = () => {
    if (readOnly) return;
    const next = endpoint.trim();
    if (!endpointIsValid(next)) {
      setEndpointError(t('admin_endpoint_invalid'));
      setTestResult(null);
      return;
    }
    setEndpointError(null);
    setTestingEndpoint(true);
    setTestResult(null);
    window.setTimeout(() => {
      setTestingEndpoint(false);
      const at = new Date().toISOString();
      if (connector.configured === false) {
        const error = '401 Unauthorized - missing access token';
        setTestResult({ ok: false, latency: 0, error });
        onEndpointTested(connector.endpoint, { at, ok: false, latency: 0, error });
        return;
      }
      const latency = 38 + ((next.length * 5) % 74);
      setTestResult({ ok: true, latency, error: null });
      setEndpoint(next);
      onEndpointTested(next, { at, ok: true, latency, error: null });
    }, 1050);
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(localeOf(lang), {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  const exportTests = () => {
    if (connector.tests.length === 0) return;
    const csv = testsToCsv(connector, {
      date: t('csv_test_date'),
      status: t('csv_test_status'),
      latency: t('csv_test_latency'),
      error: t('csv_test_error'),
      ok: t('admin_check_ok'),
      fail: t('admin_test_fail_label'),
      connector: t('csv_meta_connector'),
      endpoint: t('csv_meta_endpoint'),
      notes: t('csv_meta_notes'),
      lastTest: t('admin_test_last'),
    }, localeOf(lang));
    const file = csvFileName(connector);
    downloadCsv(file, csv);
    onNotify(t('admin_test_export_done', { file }));
  };

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <header className="p-4 md:p-5 border-b border-background-200 flex flex-wrap items-start gap-3">
        <span className="w-10 h-10 rounded-lg bg-background-100 border border-background-200 flex items-center justify-center text-foreground-800 shrink-0">
          <i className={`${KIND_ICON[connector.kind] || 'ri-plug-line'} text-lg`} />
        </span>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="max-w-md">
              <label htmlFor={`rename-${connector.id}`} className="font-label text-[10px] uppercase tracking-wider text-foreground-500">
                {t('admin_rename')}
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  id={`rename-${connector.id}`}
                  type="text"
                  autoFocus
                  maxLength={60}
                  value={nameDraft}
                  onChange={(e) => { setNameDraft(e.target.value); setNameError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                  }}
                  placeholder={t('admin_rename_placeholder')}
                  className="min-w-0 flex-1 basis-48 box-border px-3 py-1.5 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                />
                <button
                  type="button"
                  onClick={submitRename}
                  disabled={!nameDraft.trim()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-[11px] font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-check-line" />{t('admin_rename_save')}
                </button>
                <button
                  type="button"
                  onClick={cancelRename}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-background-300 bg-background-50 text-[11px] font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100"
                >
                  <i className="ri-close-line" />{t('admin_rename_cancel')}
                </button>
              </div>
              {nameError ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-700">
                  <i className="ri-error-warning-line" />{nameError}
                </p>
              ) : (
                <p className="mt-1 font-label text-[10px] text-foreground-500">{t('admin_rename_hint')}</p>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-1.5 min-w-0">
              <h2 className="font-heading text-lg md:text-xl font-bold text-foreground-950 truncate">{connector.name}</h2>
              <button
                type="button"
                onClick={startRename}
                title={t('admin_rename_aria', { name: connector.name })}
                aria-label={t('admin_rename_aria', { name: connector.name })}
                className="w-6 h-6 shrink-0 mt-0.5 flex items-center justify-center rounded-md text-foreground-500 cursor-pointer hover:bg-background-200 hover:text-foreground-900"
              >
                <i className="ri-pencil-line text-[13px]" />
              </button>
            </div>
          )}
          <p className="mt-0.5 font-label text-[11px] text-foreground-500">
            {t('admin_config')} · {connector.version} · {connector.scope === 'tenant' ? t('admin_scope_tenant') : t('admin_scope_platform')}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-label text-[11px] whitespace-nowrap ${health.badge}`}>
          <i className={health.icon} />
          {t(`admin_health_${connector.health}`)}
        </span>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={readOnly}
          title={readOnly ? t('admin_readonly_action') : t('admin_duplicate_aria', { name: connector.name })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-background-300 text-[11px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100 hover:text-foreground-900"
        >
          <i className="ri-file-copy-line" />{t('admin_duplicate')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={readOnly}
          title={readOnly ? t('admin_readonly_action') : t('admin_delete_aria', { name: connector.name })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-background-300 text-[11px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-accent-100 hover:text-accent-900 hover:border-accent-300"
        >
          <i className="ri-delete-bin-6-line" />{t('admin_delete')}
        </button>
      </header>

      {connector.retestRequiredAt && (
        <div className="border-b border-accent-300 bg-accent-100/70 px-4 md:px-5 py-3 flex flex-wrap items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-accent-500 text-background-50 dark:text-foreground-950 flex items-center justify-center shrink-0">
            <i className="ri-alert-line" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground-950">{t('admin_retest_title')}</p>
            <p className="mt-0.5 text-[11px] text-foreground-700">{t('admin_retest_hint')}</p>
            <p className="mt-0.5 font-label text-[10px] text-foreground-500">
              {t('admin_retest_since', { date: formatDate(connector.retestRequiredAt) })}
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
            onClick={testEndpoint}
            disabled={testingEndpoint || readOnly}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-600 hover:bg-accent-700 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className={testingEndpoint ? 'ri-loader-4-line animate-spin' : 'ri-pulse-line'} />
            {testingEndpoint ? t('admin_endpoint_testing') : t('admin_retest_action')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-background-200">
        <div className="p-4 md:p-5 space-y-4">
          <div className="rounded-lg bg-background-100 border border-background-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`notes-${connector.id}`} className="font-label text-[10px] uppercase tracking-wider text-foreground-500">
                {t('admin_notes')}
              </label>
              {notesDirty && (
                <span className="font-label text-[10px] px-2 py-0.5 rounded-md bg-accent-100 text-accent-900 whitespace-nowrap">
                  {t('admin_notes_unsaved')}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-foreground-600">{t('admin_notes_hint')}</p>
            <textarea
              id={`notes-${connector.id}`}
              rows={3}
              maxLength={500}
              value={notesDraft}
              placeholder={t('admin_notes_placeholder')}
              onChange={(e) => { setNotesDraft(e.target.value); setNotesError(null); }}
              className="mt-2 block w-full min-w-0 box-border px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs leading-relaxed text-foreground-950 resize-y focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
            />
            {notesError ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-700">
                <i className="ri-error-warning-line" />{notesError}
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="font-label text-[10px] text-foreground-500">{notesDraft.length}/500</span>
                <button
                  type="button"
                  onClick={saveNotes}
                  disabled={!notesDirty}
                  className="ms-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-background-300 bg-background-50 text-[11px] font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-save-3-line" />{t('admin_notes_save')}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-background-100 border border-background-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`endpoint-${connector.id}`} className="font-label text-[10px] uppercase tracking-wider text-foreground-500">
                {t('admin_endpoint')}
              </label>
              {endpointDirty && (
                <span className="font-label text-[10px] px-2 py-0.5 rounded-md bg-accent-100 text-accent-900 whitespace-nowrap">
                  {t('admin_endpoint_unsaved')}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-foreground-600">{t('admin_endpoint_hint')}</p>
            <div className="mt-2 space-y-2">
              <input
                id={`endpoint-${connector.id}`}
                type="url"
                dir="ltr"
                value={endpoint}
                placeholder={t('admin_endpoint_placeholder')}
                onChange={(e) => { setEndpoint(e.target.value); setEndpointError(null); setTestResult(null); }}
                className="block w-full min-w-0 box-border px-3 py-2 rounded-lg border border-background-300 bg-background-50 font-label text-[12px] text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={saveEndpoint}
                  disabled={!endpointDirty}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-save-3-line" />{t('admin_endpoint_save')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={endpointIsOriginal(connector, endpoint) || confirmReset}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-arrow-go-back-line" />{t('admin_endpoint_reset')}
                </button>
                <button
                  type="button"
                  onClick={testEndpoint}
                  disabled={testingEndpoint}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed sm:ms-auto"
                >
                  <i className={testingEndpoint ? 'ri-loader-4-line animate-spin' : 'ri-plug-line'} />
                  {testingEndpoint ? t('admin_endpoint_testing') : t('admin_endpoint_test')}
                </button>
              </div>
            </div>
            {confirmReset && (
              <div className="mt-2 rounded-lg border border-accent-300 bg-accent-100/70 p-2.5">
                <p className="text-xs font-semibold text-foreground-950">{t('admin_endpoint_reset_confirm_title')}</p>
                <p className="mt-0.5 text-[11px] text-foreground-700">{t('admin_endpoint_reset_confirm_hint')}</p>
                <p className="mt-1 font-label text-[10px] text-foreground-600 truncate" dir="ltr" title={connector.endpointDefault}>
                  {connector.endpointDefault}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={resetEndpoint}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-background-50 dark:text-foreground-950 text-[11px] font-semibold whitespace-nowrap cursor-pointer"
                  >
                    <i className="ri-arrow-go-back-line" />{t('admin_endpoint_reset_confirm_ok')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-background-300 bg-background-50 text-[11px] font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100"
                  >
                    <i className="ri-close-line" />{t('admin_endpoint_reset_confirm_cancel')}
                  </button>
                </div>
              </div>
            )}
            {endpointError && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-accent-700">
                <i className="ri-error-warning-line" />{endpointError}
              </p>
            )}
            {!endpointError && testResult && (
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

          <div className="rounded-lg bg-background-100 border border-background-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading font-semibold text-sm text-foreground-950">{t('admin_test_history')}</h3>
              <div className="flex items-center gap-2">
                <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
                  {connector.tests.length}
                </span>
                <button
                  type="button"
                  onClick={exportTests}
                  disabled={connector.tests.length === 0}
                  title={t('admin_test_export')}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 bg-background-50 text-[11px] font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-download-2-line" />{t('admin_test_export')}
                </button>
              </div>
            </div>
            {connector.tests.length === 0 ? (
              <p className="mt-1.5 font-label text-[11px] text-foreground-500">{t('admin_test_history_empty')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-background-200">
                {connector.tests.slice(0, 4).map((entry) => (
                  <li key={`${entry.at}-${entry.latency}`} className="py-1.5 flex items-start gap-2 min-w-0">
                    <span className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 ${entry.ok ? 'text-primary-700 dark:text-primary-300' : 'text-accent-700'}`}>
                      <i className={entry.ok ? 'ri-checkbox-circle-line' : 'ri-close-circle-line'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-label text-[11px] text-foreground-800">
                        {entry.ok ? `OK · ${entry.latency} ms` : t('admin_test_fail_label')}
                      </p>
                      {entry.error && (
                        <p className="font-label text-[10px] text-accent-700 truncate" title={entry.error} dir="ltr">{entry.error}</p>
                      )}
                    </div>
                    <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">{formatDate(entry.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg bg-background-100 border border-background-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading font-semibold text-sm text-foreground-950">{t('admin_history_title')}</h3>
              <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
                {t('admin_history_count', { count: history.length })}
              </span>
            </div>
            <p className="mt-0.5 font-label text-[10px] text-foreground-500">{t('admin_history_hint')}</p>
            {history.length === 0 ? (
              <p className="mt-1.5 font-label text-[11px] text-foreground-500">{t('admin_history_empty')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-background-200">
                {history.slice(0, 6).map((change) => (
                  <li key={`${change.at}-${change.field}`} className="py-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="font-label text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background-200 text-foreground-700 whitespace-nowrap">
                        {t(`admin_history_field_${change.field}`)}
                      </span>
                      <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">{formatDate(change.at)}</span>
                      <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
                        · {t('admin_history_by', { author: change.author })}
                      </span>
                    </div>
                    {change.field !== 'import' && (
                      <p className="mt-1 min-w-0 font-label text-[11px] text-foreground-700 break-words" dir="ltr">
                        <span className="text-foreground-500 line-through">{change.before || '—'}</span>
                        <span className="mx-1 text-foreground-500">→</span>
                        <span className="text-foreground-900">{change.after || '—'}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {history.length > 6 && (
              <p className="mt-1 font-label text-[10px] text-foreground-500">
                {t('admin_history_more', { count: history.length - 6 })}
              </p>
            )}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { k: t('admin_auth'), v: connector.authMode },
              { k: t('admin_version'), v: connector.version },
              { k: t('admin_uptime'), v: connector.uptime ? `${connector.uptime}%` : '—' },
              { k: t('admin_latency'), v: connector.latencyMs ? `${connector.latencyMs} ms` : '—' },
            ].map((m) => (
              <div key={m.k} className="min-w-0 p-2.5 rounded-lg bg-background-100 border border-background-200">
                <dt className="font-label text-[10px] uppercase tracking-wider text-foreground-500 truncate">{m.k}</dt>
                <dd className="mt-0.5 text-sm font-medium text-foreground-900 truncate">{m.v}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="font-heading font-semibold text-foreground-950">{t('admin_health_check')}</h3>
            <ul className="mt-2 space-y-1.5">
              {connector.checks.map((check) => (
                <li key={check.label.fr} className="flex items-center gap-2 text-sm">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${check.ok ? 'bg-primary-100 text-primary-700 dark:text-primary-300' : 'bg-accent-100 text-accent-700'}`}>
                    <i className={check.ok ? 'ri-check-line' : 'ri-close-line'} />
                  </span>
                  <span className="text-foreground-800">{tx(check.label, lang)}</span>
                  <span className="ml-auto font-label text-[10px] text-foreground-500">
                    {check.ok ? t('admin_check_ok') : t('admin_check_ko')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-4 md:p-5">
          <h3 className="font-heading font-semibold text-foreground-950">{t('admin_capabilities')}</h3>
          <p className="mb-2 font-label text-[11px] text-foreground-500">{t('admin_capabilities_hint')}</p>
          <ul className="space-y-1.5">
            {connector.capabilities.map((cap) => (
              <li key={cap} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-background-100 border border-background-200">
                <span className="w-4 h-4 flex items-center justify-center text-primary-700 dark:text-primary-300 shrink-0 mt-0.5">
                  <i className="ri-arrow-right-line" />
                </span>
                <code className="font-label text-[11px] text-foreground-800 break-all" dir="ltr">{cap}</code>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-lg bg-background-100 border border-background-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-heading font-semibold text-sm text-foreground-950">{t('admin_batch_history_title')}</h3>
            </div>
            <p className="mt-0.5 font-label text-[10px] text-foreground-500 leading-relaxed">{t('admin_batch_history_hint')}</p>
            {batchHistory.length === 0 ? (
              <p className="mt-1.5 font-label text-[11px] text-foreground-500">{t('admin_batch_history_empty')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-background-200">
                {batchHistory.slice(0, 3).map((run, index) => {
                  const older = batchHistory[index + 1];
                  const diff = older && older.avgLatencyMs > 0
                    ? Math.round(((run.avgLatencyMs - older.avgLatencyMs) / older.avgLatencyMs) * 100)
                    : null;
                  const trend = diff === null ? null : diff <= -5 ? 'faster' : diff >= 5 ? 'slower' : 'equal';
                  const trendTone = trend === 'faster'
                    ? 'text-primary-700 dark:text-primary-300'
                    : trend === 'slower' ? 'text-accent-700' : 'text-foreground-500';
                  const trendIcon = trend === 'faster'
                    ? 'ri-arrow-down-line'
                    : trend === 'slower' ? 'ri-arrow-up-line' : 'ri-subtract-line';
                  return (
                    <li key={`${run.at}-${index}`} className="py-1.5 flex items-start gap-2 min-w-0">
                      <span className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 ${run.failed > 0 ? 'text-accent-700' : 'text-primary-700 dark:text-primary-300'}`}>
                        <i className={run.failed > 0 ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-label text-[11px] text-foreground-900 truncate">
                          {t('admin_batch_history_meta', { count: run.total, ok: run.ok })}
                        </p>
                        <p className="font-label text-[10px] text-foreground-500 truncate">
                          {formatDate(run.at)}
                          {run.failed > 0 && (
                            <span className="text-accent-700"> · {t('admin_batch_history_failed', { count: run.failed })}</span>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="font-label text-[11px] font-semibold text-foreground-900 tabular-nums">{run.avgLatencyMs} ms</p>
                        {trend && (
                          <p className={`font-label text-[10px] whitespace-nowrap ${trendTone}`}>
                            <i className={`${trendIcon} me-0.5`} />
                            {t(`admin_batch_history_${trend}`)}
                            {trend !== 'equal' && diff !== null ? ` ${Math.abs(diff)}%` : ''}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-background-200">
        <div className="px-4 md:px-5 py-3.5 flex flex-wrap items-center gap-2">
          <div>
            <h3 className="font-heading font-semibold text-foreground-950">{t('admin_catalog_imported')}</h3>
            <p className="font-label text-[11px] text-foreground-500">{t('admin_catalog_hint')}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="font-label text-[10px] px-2 py-1 rounded-md bg-primary-100 text-primary-800 dark:text-primary-900">
              {publishedCount(connector)} {t('admin_map_mapped')}
            </span>
            <span className="font-label text-[10px] px-2 py-1 rounded-md bg-secondary-100 text-secondary-800 dark:text-secondary-900">
              {reviewCount(connector)} {t('admin_map_review')}
            </span>
          </div>
        </div>

        {connector.catalog.length === 0 ? (
          <div className="px-5 pb-8 pt-2 text-center">
            <span className="w-11 h-11 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
              <i className="ri-inbox-line" />
            </span>
            <p className="mt-2 text-sm text-foreground-600">{t('admin_catalog_empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left font-label text-[10px] uppercase tracking-wider text-foreground-500 bg-background-100">
                  <th className="px-4 py-2.5 font-normal">{t('col_service')}</th>
                  <th className="px-4 py-2.5 font-normal">{t('admin_engine_ref')}</th>
                  <th className="px-4 py-2.5 font-normal">{t('admin_category')}</th>
                  <th className="px-4 py-2.5 font-normal">{t('admin_mapping')}</th>
                  <th className="px-4 py-2.5 font-normal">{t('admin_last_sync')}</th>
                  <th className="px-4 py-2.5 font-normal text-right">{t('admin_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-200">
                {connector.catalog.map((item) => (
                  <tr key={item.id} className="hover:bg-background-100">
                    <td className="px-4 py-2.5">
                      <span className="block font-medium text-foreground-950">{tx(item.name, lang)}</span>
                    </td>
                    <td className="px-4 py-2.5 font-label text-[11px] text-foreground-600 whitespace-nowrap" dir="ltr">{item.engineRef}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground-700 whitespace-nowrap">{t(`cat_${item.category}`)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${MAP_STYLE[item.status]}`}>
                        {t(`admin_map_${item.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-label text-[10px] text-foreground-500 whitespace-nowrap">{formatDate(item.lastSync)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onToggleMap(item.id)}
                        disabled={readOnly}
                        title={readOnly ? t('admin_readonly_action') : undefined}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap cursor-pointer ${item.status === 'mapped' ? 'border-background-300 text-foreground-700 hover:bg-background-200' : 'border-primary-400 text-primary-800 dark:text-primary-300 hover:bg-primary-100'}`}
                      >
                        <i className={item.status === 'mapped' ? 'ri-eye-off-line' : 'ri-eye-line'} />
                        {item.status === 'mapped' ? t('admin_ignore_action') : t('admin_map_action')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}