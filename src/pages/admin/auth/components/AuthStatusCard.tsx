import { useTranslation } from 'react-i18next';
import type { AuthConfig } from '@/utils/auth';

type Props = {
  config: AuthConfig | null;
  redirectUri: string;
  onCopy: (value: string) => void;
};

const CHECK_KEYS: { key: keyof AuthConfig['checks']; label: string }[] = [
  { key: 'baseUrl', label: 'auth_check_base_url' },
  { key: 'clientId', label: 'auth_check_client_id' },
  { key: 'clientSecret', label: 'auth_check_client_secret' },
  { key: 'redirectUri', label: 'auth_check_redirect' },
];

export default function AuthStatusCard({ config, redirectUri, onCopy }: Props) {
  const { t } = useTranslation();
  const active = config?.mode === 'awx';

  return (
    <section className="rounded-xl border border-background-200 bg-background-50 p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold text-foreground-950">{t('auth_status_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600 leading-relaxed">{t('auth_status_subtitle')}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label text-[10px] uppercase tracking-widest whitespace-nowrap ${active ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300' : 'bg-accent-100 text-accent-900'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary-500' : 'bg-accent-500'}`} aria-hidden="true" />
          {active ? t('auth_status_active') : t('auth_status_disabled')}
        </span>
      </header>

      {!active && (
        <div className="mt-4 rounded-lg border border-accent-300 bg-accent-50 px-3.5 py-3">
          <p className="text-xs font-semibold text-accent-900">{t('auth_status_disabled_title')}</p>
          <p className="mt-1 text-xs text-accent-900/80 leading-relaxed">{t('auth_status_disabled_hint')}</p>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CHECK_KEYS.map((check) => {
          const ok = Boolean(config?.checks?.[check.key]);
          return (
            <div key={check.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background-100 border border-background-200 min-w-0">
              <span className={`w-5 h-5 flex items-center justify-center shrink-0 ${ok ? 'text-primary-600' : 'text-foreground-400'}`}>
                <i className={ok ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'} />
              </span>
              <dt className="text-xs text-foreground-700 truncate flex-1">{t(check.label)}</dt>
              <dd className={`font-label text-[10px] uppercase tracking-widest shrink-0 ${ok ? 'text-primary-700' : 'text-foreground-500'}`}>
                {ok ? t('auth_check_ok') : t('auth_check_ko')}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 min-w-0">
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_redirect_uri')}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <code dir="ltr" className="flex-1 min-w-0 truncate font-label text-[11px] text-foreground-800">{redirectUri || '—'}</code>
            <button
              type="button"
              onClick={() => onCopy(redirectUri)}
              disabled={!redirectUri}
              aria-label={t('auth_copy_redirect')}
              className="w-6 h-6 flex items-center justify-center rounded-md border border-background-300 bg-background-50 text-foreground-700 hover:bg-background-200 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer"
            >
              <i className="ri-file-copy-line text-[11px]" />
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 min-w-0">
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_scopes')}</p>
          <p dir="ltr" className="mt-0.5 font-label text-[11px] text-foreground-800 truncate">{config?.scopes || '—'}</p>
        </div>
        <div className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 min-w-0">
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_session_hours')}</p>
          <p className="mt-0.5 font-label text-[11px] text-foreground-800">{config?.sessionHours ?? '—'} h</p>
        </div>
        <div className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 min-w-0">
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('auth_admin_list')}</p>
          <p className="mt-0.5 font-label text-[11px] text-foreground-800">{config?.adminUsernames ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-foreground-950 text-background-50 px-3.5 py-3">
        <p className="font-label text-[10px] uppercase tracking-widest text-background-400">{t('auth_setup_title')}</p>
        <ol className="mt-2 space-y-1.5 text-[11px] text-background-300 leading-relaxed list-decimal list-inside">
          <li>{t('auth_setup_step_1')}</li>
          <li>{t('auth_setup_step_2')}</li>
          <li>{t('auth_setup_step_3')}</li>
          <li>{t('auth_setup_step_4')}</li>
        </ol>
        <code dir="ltr" className="mt-2.5 block overflow-x-auto whitespace-pre font-label text-[10px] text-primary-300 bg-background-50/5 rounded-md px-2.5 py-2">
          AUTH_MODE=awx
          {'\n'}
          AWX_BASE_URL=https://awx.example.com
          {'\n'}
          AWX_CLIENT_ID=...
          {'\n'}
          AWX_CLIENT_SECRET=...
        </code>
      </div>
    </section>
  );
}