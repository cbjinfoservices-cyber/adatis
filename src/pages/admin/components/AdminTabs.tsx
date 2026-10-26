import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TABS = [
  { to: '/admin/connectors', key: 'admin_tab_connectors', icon: 'ri-plug-line' },
  { to: '/admin/adapters', key: 'admin_tab_adapters', icon: 'ri-plug-2-line' },
  { to: '/admin/services', key: 'admin_tab_services', icon: 'ri-stack-line' },
  { to: '/admin/branding', key: 'admin_tab_branding', icon: 'ri-palette-line' },
  { to: '/admin/system', key: 'admin_tab_system', icon: 'ri-server-line' },
  { to: '/admin/auth', key: 'admin_tab_auth', icon: 'ri-shield-keyhole-line' },
];

export default function AdminTabs() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('admin_tabs_label')}
      className="inline-flex items-center gap-1 p-1 rounded-full bg-background-200 border border-background-300 max-w-full overflow-x-auto"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap cursor-pointer transition-colors ${isActive ? 'bg-background-50 text-foreground-950 font-semibold shadow-sm' : 'text-foreground-600 hover:text-foreground-900'}`}
        >
          <span className="w-4 h-4 flex items-center justify-center"><i className={tab.icon} /></span>
          {t(tab.key)}
        </NavLink>
      ))}
    </nav>
  );
}