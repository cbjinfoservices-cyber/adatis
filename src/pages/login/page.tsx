import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { startLogin } from '@/utils/auth';
import { applyPalette, getActiveTenantId, resolveActiveBranding } from '@/utils/branding';
import { loadStore, useStore } from '@/utils/store';
import LanguageMenu from '@/components/feature/LanguageMenu';

const ERROR_KEYS: Record<string, string> = {
  disabled: 'auth_login_error_disabled',
  misconfigured: 'auth_login_misconfigured_body',
  invalid_state: 'auth_login_error_state',
  exchange_failed: 'auth_login_error_exchange',
  awx_unreachable: 'auth_login_error_unreachable',
};

const FEATURES = [
  { icon: 'ri-shield-keyhole-line', title: 'auth_login_feature_sso', body: 'auth_login_feature_sso_body' },
  { icon: 'ri-key-2-line', title: 'auth_login_feature_token', body: 'auth_login_feature_token_body' },
  { icon: 'ri-team-line', title: 'auth_login_feature_roles', body: 'auth_login_feature_roles_body' },
];

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const { me, config, loading, user } = useAuth();
  const { tenants } = useStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadStore();
  }, []);

  const brand = useMemo(() => resolveActiveBranding(tenants, getActiveTenantId()), [tenants]);

  useEffect(() => {
    applyPalette(brand.palette);
  }, [brand.palette]);

  const errorCode = params.get('auth_error');
  const next = params.get('next') || '/';
  const errorKey = errorCode ? ERROR_KEYS[errorCode] : null;

  const copyRedirect = async () => {
    if (!config?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(config.redirectUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  if (!loading && me?.authenticated && user) {
    return <Navigate to={next} replace />;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background-50">
      {/* Panneau de gauche : promesse produit */}
      <aside className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 bg-foreground-950 text-background-50 overflow-hidden">
        <div className="absolute inset-0">
          {/* Motif « réseau d'automatisation » dessiné en SVG : aucune image distante. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 600 800"
            preserveAspectRatio="xMidYMid slice"
            className="w-full h-full text-primary-400 opacity-35"
          >
            <g stroke="currentColor" strokeWidth="1" opacity="0.6">
              <path d="M80 120 L240 210 L420 140 L540 260 M240 210 L200 380 L360 430 L420 140 M360 430 L520 520 L460 690 M200 380 L90 520 L230 650 L460 690 M90 520 L60 300 L80 120 M230 650 L360 430" fill="none" />
            </g>
            <g fill="currentColor">
              {[[80, 120], [240, 210], [420, 140], [540, 260], [200, 380], [360, 430], [520, 520], [460, 690], [90, 520], [230, 650], [60, 300]].map(([cx, cy]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" />
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 bg-gradient-to-b from-foreground-950/80 via-foreground-950/60 to-foreground-950" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center overflow-hidden shrink-0">
              {brand.logo
                ? <img src={brand.logo} alt={brand.platformName} className="w-full h-full object-contain" />
                : <i className="ri-flashlight-line text-xl" />}
            </span>
            <span className="leading-tight">
              <span className="block font-heading font-bold text-lg">{brand.platformName}</span>
              <span className="block font-label text-[10px] uppercase tracking-widest text-background-400">{brand.tagline}</span>
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="font-label text-[11px] uppercase tracking-[0.2em] text-primary-300">{t('auth_login_eyebrow')}</p>
          <h1 className="mt-3 font-heading text-3xl xl:text-4xl font-bold leading-tight">{t('auth_login_headline')}</h1>
          <p className="mt-3 text-sm text-background-300 leading-relaxed">{t('auth_login_subtitle')}</p>

          <ul className="mt-8 space-y-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-background-50/10 border border-background-50/15 flex items-center justify-center shrink-0 text-primary-300">
                  <i className={`${feature.icon} text-base`} />
                </span>
                <span className="min-w-0">
                  <span className="block font-heading text-sm font-semibold">{t(feature.title)}</span>
                  <span className="block text-xs text-background-400 leading-relaxed mt-0.5">{t(feature.body)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-label text-[11px] text-background-500">
          {t('auth_login_footer', { platform: brand.platformName, year: new Date().getFullYear() })}
        </p>
      </aside>

      {/* Panneau de droite : connexion */}
      <main className="flex flex-col min-w-0">
        <div className="h-16 px-4 md:px-8 flex items-center justify-end gap-2 border-b border-background-200">
          <LanguageMenu />
        </div>

        <div className="flex-1 flex items-center justify-center px-4 md:px-8 py-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <span className="w-10 h-10 rounded-xl bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center overflow-hidden shrink-0">
                {brand.logo
                  ? <img src={brand.logo} alt={brand.platformName} className="w-full h-full object-contain" />
                  : <i className="ri-flashlight-line text-xl" />}
              </span>
              <span className="font-heading font-bold text-foreground-950">{brand.platformName}</span>
            </div>

            <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('auth_login_title')}</h2>
            <p className="mt-2 text-sm text-foreground-600 leading-relaxed">{t('auth_login_intro')}</p>

            {errorCode && (
              <div className="mt-6 rounded-xl border border-accent-300 bg-accent-50 px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 flex items-center justify-center shrink-0 text-accent-700">
                    <i className="ri-error-warning-line" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-accent-900">{t('auth_login_error_title')}</p>
                    <p className="mt-1 text-xs text-accent-900/80 leading-relaxed">
                      {errorKey ? t(errorKey) : t('auth_login_error_generic', { code: errorCode })}
                    </p>
                    {errorCode === 'disabled' && (
                      <Link to="/" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline cursor-pointer">
                        <i className="ri-arrow-left-line" />
                        {t('auth_login_continue')}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="mt-8 h-11 rounded-lg bg-background-100 animate-pulse" />
            ) : config?.mode === 'awx' ? (
              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => startLogin(next)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors"
                >
                  <i className="ri-shield-keyhole-line text-base" />
                  {t('auth_login_cta')}
                </button>
                <p className="mt-3 flex items-start gap-1.5 text-xs text-foreground-500 leading-relaxed">
                  <span className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5"><i className="ri-lock-2-line" /></span>
                  {t('auth_login_secure')}
                </p>

                {errorCode && config.redirectUri && (
                  <div className="mt-6 rounded-xl border border-background-200 bg-background-100 p-3.5">
                    <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_login_hint_redirect')}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code dir="ltr" className="flex-1 min-w-0 truncate font-label text-[11px] text-foreground-800">{config.redirectUri}</code>
                      <button
                        type="button"
                        onClick={() => { void copyRedirect(); }}
                        aria-label={t('auth_copy_redirect')}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-background-300 bg-background-50 text-foreground-700 hover:bg-background-200 shrink-0 cursor-pointer"
                      >
                        <i className={copied ? 'ri-check-line text-primary-600' : 'ri-file-copy-line'} />
                      </button>
                    </div>
                    {copied && <p className="mt-1 text-[11px] text-primary-700">{t('auth_copied')}</p>}
                  </div>
                )}
              </div>
            ) : config?.mode === 'misconfigured' ? (
              <div className="mt-7 rounded-xl border border-accent-300 bg-accent-50 p-4">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 flex items-center justify-center shrink-0 text-accent-700">
                    <i className="ri-lock-2-line" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-accent-900">{t('auth_login_misconfigured_title')}</p>
                    <p className="mt-1 text-xs text-accent-900/80 leading-relaxed">{t('auth_login_misconfigured_body')}</p>
                    <ul className="mt-2 space-y-1">
                      {([
                        ['AWX_BASE_URL', config.checks.baseUrl],
                        ['AWX_CLIENT_ID', config.checks.clientId],
                        ['AWX_CLIENT_SECRET', config.checks.clientSecret],
                      ] as const).map(([name, ok]) => (
                        <li key={name} className="flex items-center gap-1.5 font-label text-[11px] text-foreground-800" dir="ltr">
                          <i className={ok ? 'ri-checkbox-circle-line text-primary-700' : 'ri-close-circle-line text-accent-700'} />
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-7 rounded-xl border border-background-200 bg-background-100 p-4">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 flex items-center justify-center shrink-0 text-foreground-500">
                    <i className="ri-information-line" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground-900">{t('auth_login_disabled_title')}</p>
                    <p className="mt-1 text-xs text-foreground-600 leading-relaxed">{t('auth_login_disabled_body')}</p>
                    <Link
                      to="/admin/auth"
                      className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline cursor-pointer"
                    >
                      <i className="ri-settings-3-line" />
                      {t('auth_login_disabled_cta')}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 pt-5 border-t border-background-200 flex items-center justify-between gap-3">
              <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 hover:text-foreground-950 cursor-pointer">
                <i className="ri-arrow-left-line" />
                {t('auth_login_back')}
              </Link>
              {config?.mode === 'awx' && (
                <span className="inline-flex items-center gap-1.5 font-label text-[10px] uppercase tracking-widest text-foreground-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500" aria-hidden="true" />
                  {t('auth_login_provider', { provider: 'Ascender' })}
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="px-4 md:px-8 py-4 text-center font-label text-[10px] text-foreground-400">
          {t('auth_login_legal', { year: new Date().getFullYear() })}
          {' · '}
          {i18n.language.toUpperCase()}
        </p>
      </main>
    </div>
  );
}