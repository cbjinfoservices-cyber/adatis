import { useTranslation } from 'react-i18next';
import { PALETTES, paletteSwatch } from '@/utils/branding';
import { tx } from '@/utils/catalog';

export default function PalettePicker({
  value, readOnly = false, onChange,
}: {
  value: string;
  readOnly?: boolean;
  onChange: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
      <header className="mb-4">
        <h2 className="font-heading font-semibold text-foreground-950">{t('brand_palette')}</h2>
        <p className="mt-0.5 text-xs text-foreground-600 max-w-xl">{t('brand_palette_hint')}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PALETTES.map((palette) => {
          const active = palette.id === value;
          return (
            <button
              key={palette.id}
              type="button"
              onClick={() => onChange(palette.id)}
              aria-pressed={active}
              disabled={readOnly}
              className={`text-start p-3 rounded-xl border cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${active ? 'border-primary-400 bg-primary-500/5 ring-1 ring-primary-400/40' : 'border-background-200 hover:border-foreground-300'}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 shrink-0">
                  <span className="w-7 h-7 rounded-lg border border-background-300" style={{ background: paletteSwatch(palette.primary) }} />
                  <span className="w-7 h-7 rounded-lg border border-background-300" style={{ background: paletteSwatch(palette.accent) }} />
                  <span className="w-7 h-7 rounded-lg border border-background-300" style={{ background: paletteSwatch(palette.secondary) }} />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground-950 truncate">{tx(palette.label, i18n.language)}</span>
                  <span className="mt-1 flex items-center gap-1 font-label text-[10px] uppercase tracking-wider text-foreground-500">
                    {t('brand_palette_primary')} · {t('brand_palette_accent')} · {t('brand_palette_secondary')}
                  </span>
                </span>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-primary-500 text-background-50 dark:text-foreground-950' : 'border border-background-300 text-transparent'}`}>
                  <i className="ri-check-line text-xs" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}