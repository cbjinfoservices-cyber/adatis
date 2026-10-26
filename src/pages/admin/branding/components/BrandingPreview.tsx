import { useTranslation } from 'react-i18next';
import { PALETTES, paletteSwatch, type TenantBranding } from '@/utils/branding';

export default function BrandingPreview({ branding }: { branding: TenantBranding }) {
  const { t } = useTranslation();
  const palette = PALETTES.find((p) => p.id === branding.palette) || PALETTES[0];

  return (
    <section className="p-4 rounded-xl bg-background-50 border border-background-200">
      <header className="mb-3">
        <h2 className="font-heading font-semibold text-foreground-950">{t('brand_preview')}</h2>
        <p className="mt-0.5 text-[11px] text-foreground-600">{t('brand_preview_hint')}</p>
      </header>

      <div className="rounded-xl border border-background-200 overflow-hidden bg-background-100">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-background-50 border-b border-background-200">
          <span className="w-7 h-7 rounded-lg bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center overflow-hidden shrink-0">
            {branding.logo
              ? <img src={branding.logo} alt="" className="w-full h-full object-contain" />
              : <i className="ri-flashlight-line text-sm" />}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block font-heading text-xs font-bold text-foreground-950 truncate">{branding.platformName || '—'}</span>
            <span className="block font-label text-[9px] uppercase tracking-widest text-foreground-500 truncate">{branding.tagline || '—'}</span>
          </span>
          <span className="ms-auto w-6 h-6 rounded-full bg-background-200 flex items-center justify-center shrink-0">
            <i className="ri-notification-3-line text-[11px] text-foreground-600" />
          </span>
        </div>

        <div className="flex items-center gap-1 px-3 py-2 bg-background-50 border-b border-background-200 overflow-hidden">
          <span className="px-2 py-1 rounded-md text-[10px] font-semibold bg-primary-500/15 text-primary-800 dark:text-primary-300 whitespace-nowrap">
            {t('brand_preview_nav')}
          </span>
          <span className="px-2 py-1 rounded-md text-[10px] text-foreground-600 whitespace-nowrap">KPI</span>
          <span className="px-2 py-1 rounded-md text-[10px] text-foreground-600 whitespace-nowrap">Tenant</span>
        </div>

        <div className="p-3">
          <div className="p-3 rounded-lg bg-background-50 border border-background-200">
            <div className="flex items-start gap-2">
              <span className="w-7 h-7 rounded-md bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center shrink-0">
                <i className="ri-server-line text-sm" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground-950 truncate">{t('brand_preview_card')}</p>
                <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-label text-[9px] bg-accent-100 text-accent-900 whitespace-nowrap">
                  <i className="ri-shield-check-line" />{t('brand_preview_badge')}
                </span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 text-[10px] font-semibold whitespace-nowrap">
                {t('brand_preview_cta')}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-secondary-100 text-secondary-900 text-[10px] font-medium whitespace-nowrap">
                Détails
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              { label: t('brand_palette_primary'), color: paletteSwatch(palette.primary) },
              { label: t('brand_palette_accent'), color: paletteSwatch(palette.accent) },
              { label: t('brand_palette_secondary'), color: paletteSwatch(palette.secondary) },
            ].map((c) => (
              <div key={c.label} className="min-w-0">
                <span className="block h-6 rounded-md border border-background-300" style={{ background: c.color }} />
                <span className="mt-1 block font-label text-[9px] uppercase tracking-wider text-foreground-500 truncate">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}