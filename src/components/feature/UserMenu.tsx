import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { roleLabelKey } from '@/utils/auth';

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-primary-500/15 text-primary-700 dark:text-primary-300',
  approver: 'bg-accent-100 text-accent-900',
  requester: 'bg-secondary-100 text-secondary-900',
};

export default function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    mode, user, permissions, me, loading, signOut, refreshToken,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshState, setRefreshState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [now, setNow] = useState(() => Date.now());
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [open]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const ok = await refreshToken();
    setRefreshState(ok ? 'ok' : 'error');
    setRefreshing(false);
    window.setTimeout(() => setRefreshState('idle'), 3500);
  };

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
    navigate('/login', { replace: true });
  };

  if (mode === 'disabled') {
    return (
      <div className="m-3 p-3 rounded-xl bg-background-100 border border-background-200">
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 flex items-center justify-center shrink-0 text-foreground-500 mt-0.5">
            <i className="ri-shield-line" />
          </span>
          <div className="min-w-0">
            <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_mode_label')}</p>
            <p className="text-xs font-semibold text-foreground-900">{t('auth_status_disabled')}</p>
            <Link
              to="/admin/auth"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 dark:text-primary-300 hover:underline cursor-pointer"
            >
              <i className="ri-settings-3-line" />
              {t('auth_config_cta')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !user) {
    return <div className="m-3 h-14 rounded-xl bg-background-100 animate-pulse" />;
  }

  const accessExpiry = me?.awx?.accessExpiresAt ? new Date(me.awx.accessExpiresAt).getTime() : 0;
  const accessValid = accessExpiry > now;
  const accessLabel = accessExpiry
    ? new Date(accessExpiry).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;
  const sessionExpiry = me?.session?.expiresAt ? new Date(me.session.expiresAt) : null;

  return (
    <div ref={boxRef} className="relative m-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full p-3 rounded-xl bg-background-100 border border-background-200 flex items-center gap-3 text-start cursor-pointer hover:border-background-300 transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-heading text-sm font-bold shrink-0">
          {user.initials}
        </span>
        <span className="text-xs leading-tight min-w-0 flex-1">
          <span className="block font-semibold text-foreground-950 truncate">{user.name}</span>
          <span className="block text-foreground-500 truncate">
            {t(roleLabelKey(user.role))}
            {user.awxUsername ? ` · ${user.awxUsername}` : ''}
          </span>
        </span>
        <span className={`w-4 h-4 flex items-center justify-center shrink-0 text-foreground-500 transition-transform ${open ? 'rotate-180' : ''}`}>
          <i className="ri-arrow-up-s-line" />
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl border border-background-200 bg-background-50 shadow-xl overflow-hidden">
          <div className="p-3 border-b border-background-200">
            <p className="font-heading text-sm font-bold text-foreground-950 truncate">{user.name}</p>
            <p className="text-[11px] text-foreground-500 truncate" dir="ltr">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`font-label text-[10px] px-2 py-0.5 rounded-full ${ROLE_STYLES[user.role] || ROLE_STYLES.requester}`}>
                {t(roleLabelKey(user.role))}
              </span>
              <span className="font-label text-[10px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-700">
                {t('auth_login_provider', { provider: 'AWX' })}
              </span>
            </div>
          </div>

          <div className="p-3 border-b border-background-200 space-y-2">
            <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_awx_token')}</p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${accessValid ? 'bg-primary-500' : 'bg-accent-500'}`} aria-hidden="true" />
              <span className="text-[11px] text-foreground-700 flex-1 min-w-0 truncate">
                {accessValid
                  ? t('auth_token_valid_until', { time: accessLabel })
                  : t('auth_token_expired')}
              </span>
              <button
                type="button"
                onClick={() => { void handleRefresh(); }}
                disabled={refreshing || !me?.awx?.hasRefreshToken}
                title={t('auth_token_refresh')}
                className="w-6 h-6 flex items-center justify-center rounded-md border border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                <i className={refreshing ? 'ri-loader-4-line animate-spin text-[11px]' : 'ri-refresh-line text-[11px]'} />
              </button>
            </div>
            {refreshState !== 'idle' && (
              <p className={`text-[11px] ${refreshState === 'ok' ? 'text-primary-700' : 'text-accent-700'}`}>
                {refreshState === 'ok' ? t('auth_token_refresh_ok') : t('auth_token_refresh_failed')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="min-w-0">
                <p className="font-label text-[10px] text-foreground-500">{t('auth_organizations')}</p>
                <p className="text-[11px] font-semibold text-foreground-900 truncate">
                  {user.organizations.length > 0 ? user.organizations.join(', ') : t('auth_none')}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-label text-[10px] text-foreground-500">{t('auth_teams')}</p>
                <p className="text-[11px] font-semibold text-foreground-900 truncate">
                  {user.teams.length > 0 ? user.teams.join(', ') : t('auth_none')}
                </p>
              </div>
            </div>
            {sessionExpiry && (
              <p className="font-label text-[10px] text-foreground-500">
                {t('auth_session_expires', {
                  time: sessionExpiry.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                })}
              </p>
            )}
          </div>

          <div className="p-1.5">
            {permissions.canAdmin && (
              <Link
                to="/admin/auth"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-foreground-700 hover:bg-background-100 cursor-pointer"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0"><i className="ri-shield-user-line" /></span>
                {t('admin_tab_auth')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => { void handleSignOut(); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-accent-700 hover:bg-accent-50 cursor-pointer"
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0"><i className="ri-logout-box-r-line" /></span>
              {t('auth_sign_out')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}