import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const LANGUAGES = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
  { code: 'ar', label: 'العربية', short: 'AR' },
];

export default function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const base = i18n.language.split('-')[0];
  const current = LANGUAGES.find((l) => l.code === base) || LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang_label')}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-background-200 bg-background-50 text-foreground-700 hover:bg-background-200 cursor-pointer"
      >
        <span className="w-4 h-4 flex items-center justify-center"><i className="ri-translate-2 text-sm" /></span>
        <span className="font-label text-xs uppercase">{current.short}</span>
        <span className="w-3.5 h-3.5 flex items-center justify-center"><i className={`ri-arrow-down-s-line text-xs transition-transform ${open ? 'rotate-180' : ''}`} /></span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('lang_label')}
          className="absolute end-0 mt-2 w-48 z-50 p-1.5 rounded-xl bg-background-50 border border-background-200 shadow-xl"
        >
          {LANGUAGES.map((lang) => {
            const active = lang.code === base;
            return (
              <li key={lang.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-start cursor-pointer ${active ? 'bg-primary-500/10 text-primary-800 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
                >
                  <span className="font-label text-[10px] uppercase w-6 h-6 rounded bg-background-200 flex items-center justify-center shrink-0">{lang.short}</span>
                  <span className="min-w-0 truncate">{lang.label}</span>
                  {lang.code === 'ar' && <span className="font-label text-[9px] px-1 py-0.5 rounded bg-secondary-100 text-secondary-900">RTL</span>}
                  {active && <span className="ms-auto w-4 h-4 flex items-center justify-center text-primary-700 dark:text-primary-300"><i className="ri-check-line" /></span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}