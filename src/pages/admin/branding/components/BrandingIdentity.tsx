import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TenantBranding } from '@/utils/branding';

const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

export default function BrandingIdentity({
  branding, readOnly = false, onChange, onNotify,
}: {
  branding: TenantBranding;
  readOnly?: boolean;
  onChange: (patch: Partial<TenantBranding>) => void;
  onNotify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file?: File | null) => {
    if (!file) return;
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError(t('brand_logo_invalid'));
      onNotify(t('brand_logo_invalid'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t('brand_logo_too_big'));
      onNotify(t('brand_logo_too_big'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange({ logo: String(reader.result || '') });
    reader.readAsDataURL(file);
  };

  return (
    <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
      <header className="mb-4">
        <h2 className="font-heading font-semibold text-foreground-950">{t('brand_identity')}</h2>
        <p className="mt-0.5 text-xs text-foreground-600 max-w-xl">{t('brand_identity_hint')}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block min-w-0">
          <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('brand_name')}</span>
          <input
            type="text"
            value={branding.platformName}
            onChange={(e) => onChange({ platformName: e.target.value })}
            maxLength={40}
            disabled={readOnly}
            className="mt-1.5 w-full box-border px-3 py-2.5 rounded-lg border border-background-300 bg-background-100 text-sm text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </label>
        <label className="block min-w-0">
          <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('brand_tagline')}</span>
          <input
            type="text"
            value={branding.tagline}
            onChange={(e) => onChange({ tagline: e.target.value })}
            maxLength={48}
            disabled={readOnly}
            className="mt-1.5 w-full box-border px-3 py-2.5 rounded-lg border border-background-300 bg-background-100 text-sm text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-xl border border-background-300 bg-background-100 flex items-center justify-center overflow-hidden shrink-0">
          {branding.logo
            ? <img src={branding.logo} alt={branding.platformName} className="w-full h-full object-contain" />
            : <i className="ri-image-line text-2xl text-foreground-400" />}
        </div>
        <div className="min-w-0">
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('brand_logo')}</p>
          <p className="text-xs text-foreground-600 mt-0.5">{t('brand_logo_hint')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={readOnly}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-upload-2-line" />{t('brand_logo_upload')}
            </button>
            {branding.logo && (
              <button
                type="button"
                onClick={() => onChange({ logo: '' })}
                disabled={readOnly}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-foreground-600 whitespace-nowrap cursor-pointer hover:text-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-delete-bin-line" />{t('brand_logo_remove')}
              </button>
            )}
          </div>
          {error && <p className="mt-1.5 text-xs text-accent-700">{error}</p>}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </section>
  );
}