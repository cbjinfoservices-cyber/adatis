import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageMenu from '@/components/feature/LanguageMenu';
import NotificationBell from '@/components/feature/NotificationBell';
import UserMenu from '@/components/feature/UserMenu';
import { useAuth } from '@/hooks/useAuth';
import useReadOnly from '@/hooks/useReadOnly';
import useAwxWatcher from '@/hooks/useAwxWatcher';
import ApiStatusBanner from '@/components/feature/ApiStatusBanner';
import { applyPalette, BRANDING_EVENT, getActiveTenantId, resolveActiveBranding } from '@/utils/branding';
import { matchesHealthFilter } from '@/utils/connectors';
import { loadStore, useStore } from '@/utils/store';

const NAV = [
  { to: '/', key: 'nav_catalog', icon: 'ri-layout-grid-line' },
  { to: '/requests', key: 'nav_requests', icon: 'ri-file-list-3-line' },
  { to: '/awx', key: 'nav_awx_jobs', icon: 'ri-git-branch-line' },
  { to: '/dashboard', key: 'nav_dashboard', icon: 'ri-bar-chart-box-line' },
  { to: '/approvals', key: 'nav_approvals', icon: 'ri-checkbox-multiple-line' },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { mode: authMode, me, permissions, loading: authLoading } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem('asp-theme') === 'dark');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTenantId, setActiveTenantId] = useState(() => getActiveTenantId());
  const { connectors, batchTests, tenants } = useStore();
  const readOnlyAdmin = useReadOnly();
  const brand = useMemo(() => resolveActiveBranding(tenants, activeTenantId), [tenants, activeTenantId]);

  // Surveille les jobs AWX en cours pour notifier leur fin, même hors de la fiche demande.
  useAwxWatcher(authMode === 'disabled' || Boolean(me?.authenticated));

  useEffect(() => {
    loadStore();
  }, []);

  const health = useMemo(() => ({
    total: connectors.length,
    healthy: connectors.filter((c) => matchesHealthFilter(c.health, 'healthy')).length,
    degraded: connectors.filter((c) => matchesHealthFilter(c.health, 'degraded')).length,
    pending: connectors.filter((c) => matchesHealthFilter(c.health, 'pending')).length,
    retest: connectors.filter((c) => Boolean(c.retestRequiredAt)).length,
  }), [connectors]);

  const batch = batchTests[0] || null;

  useEffect(() => {
    applyPalette(brand.palette);
  }, [brand.palette]);

  useEffect(() => {
    const syncBrand = () => setActiveTenantId(getActiveTenantId());
    window.addEventListener(BRANDING_EVENT, syncBrand);
    return () => window.removeEventListener(BRANDING_EVENT, syncBrand);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('asp-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const base = (i18n.language || 'fr').split('-')[0];
    document.documentElement.lang = base;
    document.documentElement.dir = base === 'ar' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  if (authMode !== 'disabled' && !authLoading && !me?.authenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  const showAdmin = authMode === 'disabled' || permissions.canViewAdmin || permissions.canAdmin || permissions.canApprove;
  const showApprovals = authMode === 'disabled' || permissions.canApprove;
  const adminBlocked = authMode === 'awx'
    && !(permissions.canAdmin || permissions.canApprove)
    && location.pathname.startsWith('/admin');
  const visibleNav = NAV.filter((item) => item.to !== '/approvals' || showApprovals);

  const sidebar = (
    <nav className="flex flex-col h-full" aria-label="Main">
      <Link to="/" className="flex items-center gap-3 px-5 h-16 border-b border-background-200 cursor-pointer">
        <span className="w-9 h-9 rounded-lg bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center shrink-0 overflow-hidden">
          {brand.logo
            ? <img src={brand.logo} alt={brand.platformName} className="w-full h-full object-contain" />
            : <i className="ri-flashlight-line text-lg" />}
        </span>
        <span className="leading-tight min-w-0">
          <span className="block font-heading font-bold text-foreground-950 truncate">{brand.platformName}</span>
          <span className="block font-label text-[10px] uppercase tracking-widest text-foreground-500 truncate">{brand.tagline}</span>
        </span>
      </Link>
      <div className="px-3 py-5 flex-1 overflow-y-auto">
        <p className="px-3 mb-2 font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('nav_section_main')}</p>
        <ul className="space-y-1">
          {visibleNav.map((item) => (
            <li key={item.key}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${isActive ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0"><i className={item.icon} /></span>
                <span className="truncate">{t(item.key)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {showAdmin && (
          <>
            <p className="px-3 mt-8 mb-2 flex items-center gap-1.5 font-label text-[10px] uppercase tracking-widest text-foreground-500">
              {t('nav_section_admin')}
              {readOnlyAdmin && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-900 normal-case tracking-normal text-[9px]">
                  <i className="ri-eye-line" aria-hidden="true" />{t('admin_readonly_badge')}
                </span>
              )}
            </p>
            <NavLink
              to="/admin/connectors"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${isActive ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0"><i className="ri-plug-line" /></span>
              <span className="truncate">{t('nav_admin')}</span>
            </NavLink>
            <NavLink
              to="/admin/adapters"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${isActive ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0"><i className="ri-plug-2-line" /></span>
              <span className="truncate">{t('admin_tab_adapters')}</span>
            </NavLink>
            <NavLink
              to="/admin/services"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${isActive ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0"><i className="ri-stack-line" /></span>
              <span className="truncate">{t('admin_tab_services')}</span>
            </NavLink>
            <NavLink
              to="/admin/branding"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${isActive ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0"><i className="ri-palette-line" /></span>
              <span className="truncate">{t('admin_tab_branding')}</span>
            </NavLink>
            <NavLink
              to="/admin/system"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${isActive ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0"><i className="ri-server-line" /></span>
              <span className="truncate">{t('admin_tab_system')}</span>
            </NavLink>
            <NavLink
              to="/admin/auth"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${isActive ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold' : 'text-foreground-700 hover:bg-background-200'}`}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0"><i className="ri-shield-keyhole-line" /></span>
              <span className="truncate">{t('admin_tab_auth')}</span>
            </NavLink>
          </>
        )}
      </div>
      {/* Santé des connecteurs : information d'administration. */}
      {showAdmin && (
      <div className="mx-3 mb-2 px-3 py-2.5 rounded-xl bg-background-100 border border-background-200">
        <div className="flex items-center justify-between gap-2">
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('sidebar_connector_health')}</p>
          <span className="font-label text-[10px] px-1.5 rounded bg-background-200 text-foreground-600">{health.total}</span>
        </div>
        <ul className="mt-1.5 space-y-0.5">
          {health.retest > 0 && (
            <li>
              <Link
                to="/admin/connectors?retest=1"
                onClick={() => setMobileOpen(false)}
                title={t('admin_retest_filter_hint')}
                className="flex items-center gap-2 px-1.5 py-1 rounded-md text-xs font-semibold text-accent-900 bg-accent-100/70 hover:bg-accent-100 transition-colors cursor-pointer"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0"><i className="ri-alert-line text-[11px]" /></span>
                <span className="truncate">{t('admin_retest_filter')}</span>
                <span className="ms-auto tabular-nums">{health.retest}</span>
              </Link>
            </li>
          )}
          {[
            { filter: 'healthy', label: t('admin_health_filter_healthy'), dot: 'bg-primary-500', count: health.healthy },
            { filter: 'degraded', label: t('admin_health_filter_degraded'), dot: 'bg-accent-500', count: health.degraded },
            { filter: 'pending', label: t('admin_health_filter_pending'), dot: 'bg-background-400', count: health.pending },
          ].map((row) => (
            <li key={row.filter}>
              <Link
                to={`/admin/connectors?health=${row.filter}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-1.5 py-1 rounded-md text-xs text-foreground-700 hover:bg-background-200 transition-colors cursor-pointer"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} aria-hidden="true" />
                <span className="truncate">{row.label}</span>
                <span className="ms-auto font-semibold text-foreground-900 tabular-nums">{row.count}</span>
              </Link>
            </li>
          ))}
        </ul>
        {batch && (
          <div className="mt-2 pt-2 border-t border-background-200">
            <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('sidebar_batch_last')}</p>
            <Link
              to="/admin/connectors?testall=1"
              onClick={() => setMobileOpen(false)}
              title={health.retest > 0 ? t('sidebar_batch_run_hint') : t('sidebar_batch_run_none')}
              className="mt-1 -mx-1 px-1 py-0.5 rounded-md flex flex-wrap items-baseline gap-x-1.5 min-w-0 cursor-pointer transition-colors hover:bg-background-200 group"
            >
              <span className="font-heading text-sm font-bold text-foreground-950 tabular-nums group-hover:text-primary-700 dark:group-hover:text-primary-300">{batch.avgLatencyMs} ms</span>
              <span className="font-label text-[10px] text-foreground-600 truncate">{t('sidebar_batch_average')}</span>
              <span className="ms-auto w-4 h-4 flex items-center justify-center shrink-0 text-foreground-500 group-hover:text-primary-700 dark:group-hover:text-primary-300">
                <i className="ri-play-circle-line text-[12px]" />
              </span>
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-label text-[10px] text-foreground-600 whitespace-nowrap">
                {t('sidebar_batch_scope', { count: batch.total })}
              </span>
              {batch.failed > 0 && (
                <span className="font-label text-[10px] text-accent-700 whitespace-nowrap">
                  · {t('sidebar_batch_failed', { count: batch.failed })}
                </span>
              )}
              <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
                · {new Date(batch.at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        )}
      </div>
      )}
      <div className="mx-3 mb-2 px-3 py-2.5 rounded-xl bg-background-100 border border-background-200">
        <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('portal_url_label')}</p>
        <a
          href={brand.portalUrl}
          target="_blank"
          rel="noreferrer"
          dir="ltr"
          title={brand.portalUrl}
          className="mt-1 flex items-center gap-1.5 min-w-0 font-label text-[11px] text-primary-700 dark:text-primary-300 hover:underline cursor-pointer"
        >
          <span className="w-4 h-4 flex items-center justify-center shrink-0"><i className="ri-external-link-line" /></span>
          <span className="truncate">{brand.portalUrl}</span>
        </a>
        <p className="mt-1 font-label text-[10px] text-foreground-500 truncate">{brand.domain}</p>
      </div>
      <UserMenu />
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background-100">
      <aside className="hidden lg:block w-64 shrink-0 bg-background-50 border-e border-background-200 sticky top-0 h-screen">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-foreground-950/40 cursor-pointer" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-background-50">{sidebar}</aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 sticky top-0 z-30 bg-background-50/90 backdrop-blur border-b border-background-200 flex items-center gap-3 px-4 md:px-6">
          <button type="button" className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-200 cursor-pointer" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <i className="ri-menu-line text-lg" />
          </button>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-background-200 bg-background-100 text-sm min-w-0">
            <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('tenant_label')}</span>
            <span className="font-semibold text-foreground-900 whitespace-nowrap">{brand.name}</span>
            <span className="font-label text-xs text-foreground-500 truncate hidden md:inline">{brand.domain}</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <LanguageMenu />
            <button type="button" onClick={() => setDark((d) => !d)} aria-label={t('theme_toggle')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-200 text-foreground-700 cursor-pointer">
              <i className={dark ? 'ri-sun-line' : 'ri-moon-line'} />
            </button>
            <span className="w-9 h-9 flex items-center justify-center shrink-0">
              <NotificationBell />
            </span>
          </div>
        </header>
        <ApiStatusBanner />
        <main className="flex-1">
          {adminBlocked ? (
            <div className="px-4 md:px-10 py-16">
              <div className="max-w-lg mx-auto rounded-2xl border border-accent-300 bg-accent-50 p-6 text-center">
                <span className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-accent-100 text-accent-700">
                  <i className="ri-lock-2-line text-xl" />
                </span>
                <h1 className="mt-3 font-heading text-xl font-bold text-foreground-950">{t('auth_access_denied_title')}</h1>
                <p className="mt-1.5 text-sm text-foreground-600 leading-relaxed">{t('auth_access_denied_body')}</p>
                <Link to="/" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer">
                  <i className="ri-arrow-left-line" />
                  {t('auth_login_back')}
                </Link>
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  );
}