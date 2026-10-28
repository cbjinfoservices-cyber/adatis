import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HEALTH_STYLE, KIND_ICON, type Connector } from '@/utils/connectors';

interface Props {
  connector: Connector;
  readOnly: boolean;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Nom (renommable), portée, état de santé et actions du connecteur. */
export default function DetailHeader({ connector, readOnly, onRename, onDuplicate, onDelete }: Props) {
  const { t } = useTranslation();
  const managed = Boolean(connector.managed);
  const health = HEALTH_STYLE[connector.health];
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(connector.name);
  const [nameError, setNameError] = useState<string | null>(null);

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

  return (
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
        {!managed && (
          <p className="mt-1 inline-flex items-start gap-1 text-[11px] text-foreground-600">
            <i className="ri-plug-2-line mt-px" />{t('admin_not_wired_hint')}
          </p>
        )}
      </div>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-label text-[11px] whitespace-nowrap ${health.badge}`}>
        <i className={health.icon} />
        {t(`admin_health_${connector.health}`)}
      </span>
      {managed ? (
        <span
          title={t('admin_managed_hint')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background-200 font-label text-[11px] text-foreground-700 whitespace-nowrap"
        >
          <i className="ri-lock-line" />{t('admin_managed_badge')}
        </span>
      ) : (
        <>
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
        </>
      )}
    </header>
  );
}
