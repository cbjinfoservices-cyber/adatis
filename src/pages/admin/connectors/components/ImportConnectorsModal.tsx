import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KIND_ICON, configEntryMatches, configTemplateBundle, configTemplateFileName, parseConfigBundle,
  type Connector, type ConnectorConfigEntry, type ImportMatchStrategy,
} from '@/utils/connectors';
import { downloadJson } from '@/utils/download';

export default function ImportConnectorsModal({
  open, existing, onClose, onImport, onNotify,
}: {
  open: boolean;
  existing: Connector[];
  onClose: () => void;
  onImport: (entries: ConnectorConfigEntry[], strategy: ImportMatchStrategy) => void;
  onNotify?: (message: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [entries, setEntries] = useState<ConnectorConfigEntry[] | null>(null);
  const [error, setError] = useState<'invalid' | 'empty' | null>(null);
  const [dragging, setDragging] = useState(false);
  const [strategy, setStrategy] = useState<ImportMatchStrategy>('name');

  useEffect(() => {
    if (open) {
      setFileName('');
      setEntries(null);
      setError(null);
      setDragging(false);
      setStrategy('name');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const downloadTemplate = () => {
    const file = configTemplateFileName();
    downloadJson(file, JSON.stringify(configTemplateBundle(), null, 2));
    onNotify?.(t('admin_config_template_done', { file }));
  };

  const readFile = async (file: File) => {
    setFileName(file.name);
    if (file.size > 1024 * 1024) {
      setEntries(null);
      setError('invalid');
      return;
    }
    try {
      const text = await file.text();
      const result = parseConfigBundle(text);
      setEntries(result.entries);
      setError(result.error);
    } catch {
      setEntries(null);
      setError('invalid');
    }
  };

  if (!open) return null;

  const created = entries ? entries.filter((entry) => !configEntryMatches(existing, entry, strategy)).length : 0;
  const updated = entries ? entries.length - created : 0;
  const ready = !!entries && entries.length > 0 && !error;

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
        aria-labelledby="import-connectors-title"
        className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-background-50 border border-background-200 shadow-xl"
      >
        <header className="p-5 border-b border-background-200 flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-secondary-100 text-secondary-800 dark:text-secondary-900 flex items-center justify-center shrink-0">
            <i className="ri-upload-2-line text-lg" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="import-connectors-title" className="font-heading text-lg font-bold text-foreground-950">
              {t('admin_import_title')}
            </h2>
            <p className="mt-1 text-xs text-foreground-600">{t('admin_import_hint')}</p>
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

        <div className="p-5 space-y-3 overflow-y-auto">
          <input
            ref={inputRef}
            id="connector-import-file"
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              if (file) void readFile(file);
              e.target.value = '';
            }}
          />

          {!fileName ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (file) void readFile(file);
              }}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-primary-400 bg-primary-100/40' : 'border-background-300 bg-background-100'}`}
            >
              <span className="w-11 h-11 mx-auto rounded-full bg-background-50 border border-background-200 text-foreground-600 flex items-center justify-center">
                <i className="ri-file-code-line text-lg" />
              </span>
              <p className="mt-2 text-xs text-foreground-600">{t('admin_import_file_hint')}</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-200"
              >
                <i className="ri-folder-open-line" />{t('admin_import_pick')}
              </button>
              <div className="mt-3 pt-3 border-t border-background-200">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background-50 border border-dashed border-background-300 text-[11px] font-semibold text-secondary-900 dark:text-secondary-800 whitespace-nowrap cursor-pointer hover:bg-background-200"
                >
                  <i className="ri-file-download-line" />{t('admin_config_template')}
                </button>
                <p className="mt-1.5 text-[11px] text-foreground-500 leading-relaxed">{t('admin_config_template_hint')}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-background-100 px-3 py-2">
              <span className="w-5 h-5 flex items-center justify-center text-foreground-600 shrink-0">
                <i className="ri-file-code-line" />
              </span>
              <span className="min-w-0 flex-1 font-label text-[11px] text-foreground-800 truncate" dir="ltr">{fileName}</span>
              <button
                type="button"
                onClick={() => { setFileName(''); setEntries(null); setError(null); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 bg-background-50 text-[11px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-200"
              >
                <i className="ri-close-line" />{t('admin_import_clear')}
              </button>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 rounded-lg border border-accent-300 bg-accent-100/70 p-2.5 text-xs text-accent-900">
              <i className="ri-error-warning-line shrink-0 mt-px" />
              {error === 'invalid' ? t('admin_import_invalid') : t('admin_import_empty')}
            </p>
          )}

          {ready && entries && (
            <>
              <div className="rounded-lg border border-background-200 bg-background-100 p-2.5">
                <p className="font-label text-[10px] uppercase tracking-wider text-foreground-500">
                  {t('admin_import_merge_label')}
                </p>
                <div
                  role="group"
                  aria-label={t('admin_import_merge_label')}
                  className="mt-1.5 inline-flex items-center gap-1 p-1 rounded-full border border-background-200 bg-background-50"
                >
                  {([
                    { key: 'name', icon: 'ri-price-tag-3-line', label: t('admin_import_merge_name') },
                    { key: 'kind', icon: 'ri-plug-line', label: t('admin_import_merge_kind') },
                  ] as { key: ImportMatchStrategy; icon: string; label: string }[]).map((option) => {
                    const active = strategy === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setStrategy(option.key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${active
                          ? 'bg-primary-500 text-background-50 dark:text-foreground-950'
                          : 'text-foreground-700 hover:bg-background-200'}`}
                      >
                        <i className={option.icon} />{option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-foreground-600">
                  {strategy === 'name' ? t('admin_import_merge_name_hint') : t('admin_import_merge_kind_hint')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-label text-[11px] text-foreground-600">
                  {t('admin_import_summary', { total: entries.length, created, updated })}
                </span>
                <span className="ms-auto inline-flex items-center gap-1 font-label text-[10px] px-2 py-0.5 rounded-md bg-primary-100 text-primary-800 dark:text-primary-900 whitespace-nowrap">
                  <i className="ri-add-line" />{created} {t('admin_import_new')}
                </span>
                <span className="inline-flex items-center gap-1 font-label text-[10px] px-2 py-0.5 rounded-md bg-secondary-100 text-secondary-800 dark:text-secondary-900 whitespace-nowrap">
                  <i className="ri-refresh-line" />{updated} {t('admin_import_update')}
                </span>
              </div>

              <ul className="divide-y divide-background-200 rounded-lg border border-background-200 max-h-64 overflow-y-auto">
                {entries.map((entry) => {
                  const match = configEntryMatches(existing, entry, strategy);
                  return (
                    <li key={`${entry.id}-${entry.kind}-${entry.name}`} className="flex items-start gap-2.5 px-3 py-2">
                      <span className="w-7 h-7 rounded-md bg-background-100 border border-background-200 flex items-center justify-center text-foreground-800 shrink-0">
                        <i className={`${KIND_ICON[entry.kind] || 'ri-plug-line'} text-xs`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground-950 truncate">{entry.name}</p>
                        <p className="font-label text-[10px] text-foreground-500 truncate" dir="ltr">{entry.endpoint}</p>
                        {match && (
                          <p className="mt-0.5 font-label text-[10px] text-secondary-800 dark:text-secondary-900 truncate">
                            <i className="ri-refresh-line me-1" />
                            {t('admin_import_replaces', { name: match.name })}
                          </p>
                        )}
                      </div>
                      <span className={`shrink-0 font-label text-[10px] px-2 py-0.5 rounded-md whitespace-nowrap ${match ? 'bg-secondary-100 text-secondary-800 dark:text-secondary-900' : 'bg-primary-100 text-primary-800 dark:text-primary-900'}`}>
                        {match ? t('admin_import_update') : t('admin_import_new')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <footer className="p-5 border-t border-background-200 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-background-300 text-sm font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-200"
          >
            {t('admin_import_cancel')}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => { if (entries) onImport(entries, strategy); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-upload-2-line" />{t('admin_import_confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}