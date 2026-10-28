import { useTranslation } from 'react-i18next';

const SECONDARY_BUTTON = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed';

interface Props {
  /** Nombre de connecteurs affichés si un filtre est actif, sinon null. */
  selectionCount: number | null;
  hasItems: boolean;
  readOnly: boolean;
  syncingAll: boolean;
  onExportSelection: () => void;
  onExport: () => void;
  onImport: () => void;
  onSyncAll: () => void;
  onAdd: () => void;
}

/** Titre de la page et actions globales (export, import, synchronisation, ajout). */
export default function ConnectorsHeader({
  selectionCount, hasItems, readOnly, syncingAll, onExportSelection, onExport, onImport, onSyncAll, onAdd,
}: Props) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('admin_title')}</h1>
        <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('admin_subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExportSelection}
          disabled={!selectionCount}
          title={t('admin_config_export_selection_hint')}
          className={SECONDARY_BUTTON}
        >
          <i className="ri-filter-3-line" />{t('admin_config_export_selection')}
          {!!selectionCount && (
            <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-800 dark:text-primary-900">{selectionCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!hasItems}
          title={t('admin_config_export')}
          className={SECONDARY_BUTTON}
        >
          <i className="ri-download-2-line" />{t('admin_config_export')}
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={readOnly}
          title={t('admin_config_import')}
          className={SECONDARY_BUTTON}
        >
          <i className="ri-upload-2-line" />{t('admin_config_import')}
        </button>
        <button
          type="button"
          onClick={onSyncAll}
          disabled={syncingAll || readOnly}
          className={SECONDARY_BUTTON}
        >
          <i className={syncingAll ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
          {syncingAll ? t('admin_syncing') : t('admin_sync_all')}
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line" />{t('admin_add')}
        </button>
      </div>
    </header>
  );
}
