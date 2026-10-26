import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TenantBranding } from '@/utils/branding';
import { tx } from '@/utils/catalog';

const NAV = [
  { key: 'preview_nav_catalog', icon: 'ri-layout-grid-line' },
  { key: 'preview_nav_requests', icon: 'ri-file-list-3-line' },
  { key: 'preview_nav_approvals', icon: 'ri-checkbox-multiple-line' },
];

const SERVICES = [
  {
    icon: 'ri-server-line',
    name: { fr: 'Créer un serveur Linux', en: 'Create a Linux server' },
    desc: { fr: 'Rocky Linux 9 · 4 vCPU / 8 Go', en: 'Rocky Linux 9 · 4 vCPU / 8 GB' },
    category: 'cat_infrastructure',
    eta: '12 min',
    approval: 'approval_manager',
    tag: true,
  },
  {
    icon: 'ri-database-2-line',
    name: { fr: 'Créer PostgreSQL', en: 'Create PostgreSQL' },
    desc: { fr: 'Version 16 · sauvegarde quotidienne', en: 'Version 16 · daily backup' },
    category: 'cat_databases',
    eta: '18 min',
    approval: 'approval_technical',
    tag: false,
  },
  {
    icon: 'ri-global-line',
    name: { fr: 'Créer une entrée DNS', en: 'Create a DNS record' },
    desc: { fr: 'Zone interne · propagation guidée', en: 'Internal zone · guided propagation' },
    category: 'cat_network',
    eta: '3 min',
    approval: 'approval_none',
    tag: false,
  },
];

export default function UserPreview({ branding, onClose }: { branding: TenantBranding; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const mobile = device === 'mobile';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const cardsClass = mobile ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-foreground-950/70 backdrop-blur-sm">
      <div className="shrink-0 min-h-14 px-4 md:px-6 py-2 flex items-center gap-3 bg-background-50 border-b border-background-200">
        <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center shrink-0">
          <i className="ri-eye-line" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground-950 truncate">{t('preview_title')}</p>
          <p className="text-[11px] text-foreground-500 truncate hidden sm:block">{t('preview_hint')}</p>
        </div>
        <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-100 text-accent-900 font-label text-[10px] uppercase tracking-wider whitespace-nowrap">
          <i className="ri-eye-off-line" />{t('preview_unpublished')}
        </span>
        <div className="ms-auto flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-full bg-background-200">
            {(['desktop', 'mobile'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDevice(mode)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${device === mode ? 'bg-background-50 text-foreground-950 shadow-sm' : 'text-foreground-600 hover:text-foreground-900'}`}
              >
                <i className={mode === 'desktop' ? 'ri-computer-line' : 'ri-smartphone-line'} />
                <span className="hidden sm:inline">{mode === 'desktop' ? t('preview_device_desktop') : t('preview_device_mobile')}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('preview_close')}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-background-300 text-foreground-700 cursor-pointer hover:bg-background-200"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className={mobile ? 'mx-auto w-full max-w-[390px]' : 'mx-auto w-full max-w-[1180px]'}>
          <div className="rounded-2xl border border-background-300 shadow-2xl overflow-hidden bg-background-100">
            <div className="flex min-h-[560px]">
              {!mobile && (
                <aside className="w-52 shrink-0 bg-background-50 border-e border-background-200 flex flex-col">
                  <div className="flex items-center gap-2.5 px-4 h-14 border-b border-background-200">
                    <span className="w-8 h-8 rounded-lg bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center shrink-0 overflow-hidden">
                      {branding.logo
                        ? <img src={branding.logo} alt={branding.platformName} className="w-full h-full object-contain" />
                        : <i className="ri-flashlight-line" />}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block font-heading text-xs font-bold text-foreground-950 truncate">{branding.platformName || '—'}</span>
                      <span className="block font-label text-[9px] uppercase tracking-widest text-foreground-500 truncate">{branding.tagline || '—'}</span>
                    </span>
                  </div>
                  <div className="p-2.5 flex-1">
                    <p className="px-2 mb-1.5 font-label text-[9px] uppercase tracking-widest text-foreground-500">{t('nav_section_main')}</p>
                    <ul className="space-y-0.5">
                      {NAV.map((item, index) => (
                        <li key={item.key}>
                          <span className={`flex items-center gap-2 px-2 py-2 rounded-lg text-[11px] ${index === 0 ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700'}`}>
                            <span className="w-4 h-4 flex items-center justify-center shrink-0"><i className={item.icon} /></span>
                            <span className="truncate">{t(item.key)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="m-2.5 p-2 rounded-lg bg-background-100 border border-background-200 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-heading text-[10px] font-bold shrink-0">CL</span>
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[10px] font-semibold text-foreground-950 truncate">Camille Laurent</span>
                      <span className="block text-[9px] text-foreground-500 truncate">DevOps · {branding.name}</span>
                    </span>
                  </div>
                </aside>
              )}

              <div className="flex-1 min-w-0 flex flex-col">
                <header className="h-12 shrink-0 px-3 flex items-center gap-2 bg-background-50 border-b border-background-200">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-background-200 bg-background-100 min-w-0">
                    <span className="font-label text-[8px] uppercase tracking-widest text-foreground-500">{t('tenant_label')}</span>
                    <span className="font-semibold text-[11px] text-foreground-900 whitespace-nowrap truncate">{branding.name}</span>
                  </span>
                  <div className="ms-auto flex items-center gap-1">
                    <span className="w-7 h-7 rounded-md flex items-center justify-center text-foreground-600"><i className="ri-notification-3-line text-sm" /></span>
                    <span className="w-7 h-7 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-heading text-[9px] font-bold">CL</span>
                  </div>
                </header>

                <main className="p-3 md:p-5 space-y-3 md:space-y-4">
                  <section className="rounded-xl bg-primary-500 text-background-50 dark:text-foreground-950 p-3.5 md:p-5">
                    <p className="font-label text-[9px] uppercase tracking-widest opacity-80">{t('preview_greeting')}</p>
                    <h2 className="mt-1 font-heading text-base md:text-2xl font-bold leading-snug">{t('preview_hero')}</h2>
                    <p className="mt-1 text-[11px] md:text-xs opacity-85 max-w-lg">{t('preview_hero_sub')}</p>
                    <div className="mt-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background-50 text-foreground-600">
                      <span className="w-4 h-4 flex items-center justify-center"><i className="ri-search-line text-xs" /></span>
                      <span className="text-[11px] truncate">{t('preview_search')}</span>
                    </div>
                  </section>

                  <div className={mobile ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-3 gap-2 md:gap-3'}>
                    {[
                      { label: t('preview_stat_services'), value: '42' },
                      { label: t('preview_stat_pending'), value: '6' },
                      { label: t('preview_stat_approvals'), value: '3' },
                    ].map((stat) => (
                      <div key={stat.label} className="p-2 md:p-3 rounded-lg bg-background-50 border border-background-200 min-w-0">
                        <p className="font-heading text-sm md:text-lg font-bold text-foreground-950 leading-none">{stat.value}</p>
                        <p className="mt-1 font-label text-[8px] md:text-[9px] uppercase tracking-wider text-foreground-500 truncate">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-heading text-xs md:text-sm font-semibold text-foreground-950">{t('preview_popular')}</h3>
                    <span className="text-[10px] font-semibold text-primary-700 dark:text-primary-300 whitespace-nowrap">{t('preview_see_all')}</span>
                  </div>

                  <div className={cardsClass}>
                    {SERVICES.map((service) => (
                      <article key={service.icon} className="p-2.5 md:p-3 rounded-xl bg-background-50 border border-background-200">
                        <div className="flex items-start gap-2">
                          <span className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center shrink-0">
                            <i className={`${service.icon} text-sm`} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] md:text-xs font-semibold text-foreground-950 truncate">{tx(service.name, i18n.language)}</p>
                            <p className="mt-0.5 font-label text-[9px] text-foreground-500 truncate">{t(service.category)} · {tx(service.desc, i18n.language)}</p>
                          </div>
                          {service.tag && (
                            <span className="font-label text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-accent-100 text-accent-900 whitespace-nowrap">{t('preview_new')}</span>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="font-label text-[9px] text-foreground-500 truncate whitespace-nowrap">
                            <i className="ri-time-line me-0.5" />{service.eta} · {t(service.approval)}
                          </span>
                          <span className="px-2 py-1 rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 text-[10px] font-semibold whitespace-nowrap">
                            {t('preview_ordered')}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="font-label text-[9px] uppercase tracking-widest text-foreground-400">{t('brand_palette')}</span>
                    <span className="h-3 w-8 rounded-sm bg-primary-500" />
                    <span className="h-3 w-8 rounded-sm bg-accent-500" />
                    <span className="h-3 w-8 rounded-sm bg-secondary-500" />
                    <span className="h-3 w-8 rounded-sm bg-foreground-800" />
                  </div>
                </main>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-background-100/80">{t('preview_footer_note')}</p>
        </div>
      </div>
    </div>
  );
}