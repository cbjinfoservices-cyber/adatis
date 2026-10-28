import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Connector } from '@/utils/connectors';

const NOTES_MAX = 500;

interface Props {
  connector: Connector;
  readOnly: boolean;
  onNotes: (notes: string) => void;
  onNotify: (message: string) => void;
}

/** Notes libres de l'équipe sur le connecteur. */
export default function NotesCard({ connector, readOnly, onNotes, onNotify }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(connector.notes || '');
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.trim() !== (connector.notes || '').trim();

  const save = () => {
    if (readOnly) return;
    const next = draft.trim();
    if (next.length > NOTES_MAX) {
      setError(t('admin_notes_max', { count: NOTES_MAX }));
      return;
    }
    setError(null);
    setDraft(next);
    onNotes(next);
    onNotify(t('admin_notes_saved', { name: connector.name }));
  };

  return (
    <div className="rounded-lg bg-background-100 border border-background-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`notes-${connector.id}`} className="font-label text-[10px] uppercase tracking-wider text-foreground-500">
          {t('admin_notes')}
        </label>
        {dirty && (
          <span className="font-label text-[10px] px-2 py-0.5 rounded-md bg-accent-100 text-accent-900 whitespace-nowrap">
            {t('admin_notes_unsaved')}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-foreground-600">{t('admin_notes_hint')}</p>
      <textarea
        id={`notes-${connector.id}`}
        rows={3}
        maxLength={NOTES_MAX}
        value={draft}
        placeholder={t('admin_notes_placeholder')}
        onChange={(e) => { setDraft(e.target.value); setError(null); }}
        className="mt-2 block w-full min-w-0 box-border px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs leading-relaxed text-foreground-950 resize-y focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
      />
      {error ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-700">
          <i className="ri-error-warning-line" />{error}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="font-label text-[10px] text-foreground-500">{draft.length}/{NOTES_MAX}</span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="ms-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-background-300 bg-background-50 text-[11px] font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-save-3-line" />{t('admin_notes_save')}
          </button>
        </div>
      )}
    </div>
  );
}
