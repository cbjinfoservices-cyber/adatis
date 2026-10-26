import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tx } from '@/utils/catalog';

export interface AdapterOption {
  kind: string;
  name: string;
  icon: string;
  description: { fr: string; en: string };
}

export default function AddConnectorModal({
  open, adapters, connectedKinds, onClose, onAdd,
}: {
  open: boolean;
  adapters: AdapterOption[];
  connectedKinds: string[];
  onClose: () => void;
  onAdd: (adapter: AdapterOption) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const chosen = adapters.find((a) => a.kind === selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label={t('admin_close')} onClick={onClose} className="absolute inset-0 bg-foreground-950/50 cursor-pointer" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-background-50 border border-background-200 shadow-xl">
        <header className="p-5 border-b border-background-200 flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold text-foreground-950">{t('admin_modal_title')}</h2>
            <p className="mt-1 text-xs text-foreground-600">{t('admin_modal_hint')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('admin_close')} className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-foreground-600 hover:bg-background-200 cursor-pointer shrink-0">
            <i className="ri-close-line" />
          </button>
        </header>

        <div className="p-5 space-y-2">
          {adapters.map((adapter) => {
            const already = connectedKinds.includes(adapter.kind);
            const active = selected === adapter.kind;
            return (
              <button
                key={adapter.kind}
                type="button"
                disabled={already}
                onClick={() => setSelected(adapter.kind)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${active ? 'border-primary-400 bg-primary-100/40 ring-1 ring-primary-400/40' : 'border-background-200 hover:border-foreground-300'} ${already ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className="w-9 h-9 rounded-lg bg-background-100 border border-background-200 flex items-center justify-center text-foreground-800 shrink-0">
                  <i className={`${adapter.icon} text-base`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="block text-sm font-semibold text-foreground-950">{adapter.name}</span>
                    {already && (
                      <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">{t('admin_already')}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-foreground-600">{tx(adapter.description, lang)}</span>
                </span>
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${active ? 'bg-primary-500 border-primary-500 text-background-50 dark:text-foreground-950' : 'border-background-300 text-transparent'}`}>
                  <i className="ri-check-line text-xs" />
                </span>
              </button>
            );
          })}
        </div>

        <footer className="p-5 border-t border-background-200 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-background-300 text-sm whitespace-nowrap cursor-pointer hover:bg-background-200">
            {t('admin_modal_cancel')}
          </button>
          <button
            type="button"
            disabled={!chosen}
            onClick={() => chosen && onAdd(chosen)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i className="ri-add-line" />{t('admin_modal_confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}