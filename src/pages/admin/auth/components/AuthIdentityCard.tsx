import { useTranslation } from 'react-i18next';
import { roleLabelKey, type AuthMode, type AwxIdentity, type PortalRole } from '@/utils/auth';

type Props = {
  identity: AwxIdentity | null;
  loading: boolean;
  error: boolean;
  mode: AuthMode;
  role?: PortalRole | null;
  onReload: () => void;
  onRefreshToken: () => void;
  refreshing: boolean;
  refreshState: 'idle' | 'ok' | 'error';
};

export default function AuthIdentityCard({
  identity, loading, error, mode, role, onReload, onRefreshToken, refreshing, refreshState,
}: Props) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-background-200 bg-background-50 p-4 md:p-5 flex flex-col">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold text-foreground-950">{t('auth_my_access_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">{t('auth_my_access_subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefreshToken}
            disabled={refreshing || mode !== 'awx'}
            title={t('auth_token_refresh')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            <i className={refreshing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
            {t('auth_token_refresh')}
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={loading || mode !== 'awx'}
            aria-label={t('sys_refresh')}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-background-300 bg-background-50 text-foreground-700 hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
          </button>
        </div>
      </header>

      {refreshState !== 'idle' && (
        <p className={`mt-2 text-xs ${refreshState === 'ok' ? 'text-primary-700' : 'text-accent-700'}`}>
          {refreshState === 'ok' ? t('auth_token_refresh_ok') : t('auth_token_refresh_failed')}
        </p>
      )}

      {mode !== 'awx' ? (
        <p className="mt-4 flex-1 text-xs text-foreground-600 leading-relaxed bg-background-100 border border-dashed border-background-300 rounded-lg px-3 py-4">
          {t('auth_identity_disabled')}
        </p>
      ) : loading ? (
        <div className="mt-4 space-y-2">
          <div className="h-4 w-1/2 rounded bg-background-100 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-background-100 animate-pulse" />
        </div>
      ) : error || !identity ? (
        <p className="mt-4 flex-1 text-xs text-accent-800 bg-accent-50 border border-accent-200 rounded-lg px-3 py-4 leading-relaxed">
          {t('auth_identity_error')}
        </p>
      ) : (
        <div className="mt-4 space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-label text-[11px] px-2 py-0.5 rounded-full bg-background-200 text-foreground-800">
              <i className="ri-user-line" />
              {identity.username}
            </span>
            <span className="inline-flex items-center gap-1.5 font-label text-[11px] px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-700 dark:text-primary-300">
              <i className="ri-shield-user-line" />
              {t(roleLabelKey(identity.role || role || 'requester'))}
            </span>
            {identity.isSuperuser && (
              <span className="inline-flex items-center gap-1.5 font-label text-[11px] px-2 py-0.5 rounded-full bg-accent-100 text-accent-900">
                <i className="ri-vip-crown-line" />
                {t('auth_superuser')}
              </span>
            )}
          </div>

          <div>
            <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_organizations')}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {identity.organizations.length === 0
                ? <span className="text-xs text-foreground-500">{t('auth_none')}</span>
                : identity.organizations.map((org) => (
                  <span key={org.id} className="font-label text-[11px] px-2 py-0.5 rounded-md bg-secondary-100 text-secondary-900">{org.name}</span>
                ))}
            </div>
          </div>

          <div>
            <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_teams')}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {identity.teams.length === 0
                ? <span className="text-xs text-foreground-500">{t('auth_none')}</span>
                : identity.teams.map((team) => (
                  <span key={team.id} className="font-label text-[11px] px-2 py-0.5 rounded-md bg-background-200 text-foreground-800">
                    {team.organization ? `${team.organization} / ${team.name}` : team.name}
                  </span>
                ))}
            </div>
          </div>

          <p className="text-[11px] text-foreground-500 leading-relaxed">{t('auth_identity_hint')}</p>
        </div>
      )}
    </section>
  );
}