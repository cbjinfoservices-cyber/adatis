import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdapterItem } from '@/utils/store';
import {
  ADAPTER_ICON_OPTIONS, KIND_PATTERN, emptyDraft, slugify, type AdapterDraft,
} from '@/pages/admin/adapters/components/adapterDraft';

export default function AdapterFormModal({
  open, adapter, onClose, onSubmit,
}: {
  open: boolean;
  adapter: AdapterItem | null;
  onClose: () => void;
  onSubmit: (values: AdapterDraft) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AdapterDraft>(emptyDraft);
  const [kindTouched, setKindTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const editing = Boolean(adapter);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    if (adapter) {
      setValues({
        kind: adapter.kind,
        name: adapter.name,
        icon: adapter.icon || 'ri-plug-line',
        descriptionFr: adapter.description?.fr || '',
        descriptionEn: adapter.description?.en || '',
      });
      setKindTouched(true);
    } else {
      setValues(emptyDraft());
      setKindTouched(false);
    }
  }, [open, adapter]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (partial: Partial<AdapterDraft>) => {
    setValues((prev) => ({ ...prev, ...partial }));
    setError(null);
  };

  const changeName = (name: string) => {
    setValues((prev) => ({
      ...prev,
      name,
      kind: editing || kindTouched ? prev.kind : slugify(name),
    }));
    setError(null);
  };

  const submit = async () => {
    const name = values.name.trim();
    const kind = values.kind.trim().toLowerCase();
    if (!name) {
      setError(t('adapt_name_required'));
      return;
    }
    if (!KIND_PATTERN.test(kind)) {
      setError(t('adapt_invalid_kind'));
      return;
    }
    setSubmitting(true);
    const message = await onSubmit({ ...values, name, kind });
    setSubmitting(false);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  };

  const fieldClass = 'mt-1.5 w-full min-w-0 box-border px-3 py-2.5 rounded-lg border border-background-300 bg-background-100 text-sm text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label={t('adapt_close')} onClick={onClose} className="absolute inset-0 bg-foreground-950/50 cursor-pointer" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-background-50 border border-background-200 shadow-xl">
        <header className="p-5 border-b border-background-200 flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center shrink-0">
            <i className={editing ? 'ri-pencil-line' : 'ri-add-line'} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold text-foreground-950">
              {editing ? t('adapt_edit_title', { name: adapter?.name }) : t('adapt_create_title')}
            </h2>
            <p className="mt-1 text-xs text-foreground-600">
              {editing ? t('adapt_edit_hint') : t('adapt_create_hint')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('adapt_close')} className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground-600 hover:bg-background-200 cursor-pointer shrink-0">
            <i className="ri-close-line" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block min-w-0">
            <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('adapt_name')}</span>
            <input
              type="text"
              value={values.name}
              maxLength={48}
              onChange={(event) => changeName(event.target.value)}
              className={fieldClass}
            />
          </label>

          <label className="block min-w-0">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('adapt_kind')}</span>
              {editing && (
                <span className="inline-flex items-center gap-1 font-label text-[10px] text-foreground-500">
                  <i className="ri-lock-line" />{t('adapt_readonly_kind')}
                </span>
              )}
            </span>
            <input
              type="text"
              dir="ltr"
              value={values.kind}
              disabled={editing}
              maxLength={32}
              onChange={(event) => { setKindTouched(true); patch({ kind: slugify(event.target.value) }); }}
              className={`${fieldClass} font-label disabled:opacity-60 disabled:cursor-not-allowed`}
            />
            <span className="mt-1 block text-[11px] text-foreground-500">{t('adapt_kind_hint')}</span>
          </label>

          <div>
            <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('adapt_icon')}</span>
            <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
              {ADAPTER_ICON_OPTIONS.map((option) => {
                const active = values.icon === option.icon;
                const label = t(option.labelKey);
                return (
                  <button
                    key={option.icon}
                    type="button"
                    aria-pressed={active}
                    aria-label={label}
                    title={label}
                    onClick={() => patch({ icon: option.icon })}
                    className={`min-w-0 px-1.5 py-2 rounded-lg border flex flex-col items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${active
                      ? 'border-primary-400 bg-primary-500/10 text-primary-700 dark:text-primary-300 ring-1 ring-primary-400/40'
                      : 'border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100'}`}
                  >
                    <span className="w-7 h-7 flex items-center justify-center">
                      <i className={`${option.icon} text-base`} aria-hidden="true" />
                    </span>
                    <span className="w-full truncate text-center font-label text-[10px] leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('adapt_desc_fr')}</span>
              <textarea
                rows={3}
                value={values.descriptionFr}
                maxLength={240}
                onChange={(event) => patch({ descriptionFr: event.target.value })}
                className={`${fieldClass} resize-y`}
              />
            </label>
            <label className="block min-w-0">
              <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('adapt_desc_en')}</span>
              <textarea
                rows={3}
                value={values.descriptionEn}
                maxLength={240}
                onChange={(event) => patch({ descriptionEn: event.target.value })}
                className={`${fieldClass} resize-y`}
              />
            </label>
          </div>

          {error && (
            <p className="inline-flex items-start gap-1.5 text-xs text-accent-700">
              <i className="ri-error-warning-line mt-0.5" />{error}
            </p>
          )}
        </div>

        <footer className="p-5 border-t border-background-200 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-background-300 text-sm font-medium text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-200">
            {t('adapt_cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className={submitting ? 'ri-loader-4-line animate-spin' : 'ri-save-3-line'} />
            {submitting ? (editing ? t('adapt_saving') : t('adapt_creating')) : t('adapt_save')}
          </button>
        </footer>
      </div>
    </div>
  );
}