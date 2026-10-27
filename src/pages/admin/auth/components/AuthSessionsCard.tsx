import { useTranslation } from 'react-i18next';
import { roleLabelKey, type ActiveSession } from '@/utils/auth';

/** Navigateur et système, lisibles, à partir du User-Agent. */
const shortAgent = (agent: string) => {
  const browser = /Edg\//.test(agent) ? 'Edge'
    : /Firefox\//.test(agent) ? 'Firefox'
      : /Chrome\//.test(agent) ? 'Chrome'
        : /Safari\//.test(agent) ? 'Safari' : '';
  const system = /Windows/.test(agent) ? 'Windows'
    : /Mac OS X/.test(agent) ? 'macOS'
      : /Android/.test(agent) ? 'Android'
        : /iPhone|iPad/.test(agent) ? 'iOS'
          : /Linux/.test(agent) ? 'Linux' : '';
  return [browser, system].filter(Boolean).join(' · ') || agent.slice(0, 40) || '—';
};

export default function AuthSessionsCard({
  sessions, loading, currentUserId, revoking, onRevoke,
}: {
  sessions: ActiveSession[];
  loading: boolean;
  currentUserId: string | null;
  revoking: string | null;
  onRevoke: (session: ActiveSession) => void;
}) {
  const { t, i18n } = useTranslation();
  const when = (value: string) => new Date(value).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <section className="rounded-xl border border-background-200 bg-background-50 p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold text-foreground-950">{t('auth_sessions_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">{t('auth_sessions_subtitle')}</p>
        </div>
        <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">
          {t('auth_sessions_count', { count: sessions.length })}
        </span>
      </header>

      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((row) => <div key={row} className="h-9 rounded-lg bg-background-100 animate-pulse" />)}
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-background-300 bg-background-100 px-3 py-6 text-center text-xs text-foreground-500">
          {t('auth_sessions_empty')}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-background-200">
                <th className="py-1.5 pe-3 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_event_col_user')}</th>
                <th className="py-1.5 pe-3 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_sessions_col_device')}</th>
                <th className="py-1.5 pe-3 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_event_col_ip')}</th>
                <th className="py-1.5 pe-3 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_sessions_col_activity')}</th>
                <th className="py-1.5" aria-label={t('admin_actions')} />
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const self = session.userId === currentUserId;
                return (
                  <tr key={`${session.userId}-${session.createdAt}`} className="border-b last:border-0 border-background-100">
                    <td className="py-2 pe-3 min-w-0">
                      <span className="block text-xs text-foreground-900 truncate max-w-[180px]">{session.name}</span>
                      <span className="block text-[10px] text-foreground-500">
                        {t(roleLabelKey(session.role))}
                        {session.username ? ` · ${session.username}` : ''}
                      </span>
                    </td>
                    <td className="py-2 pe-3">
                      <span className="text-xs text-foreground-700 whitespace-nowrap" title={session.userAgent}>{shortAgent(session.userAgent)}</span>
                    </td>
                    <td className="py-2 pe-3">
                      <span dir="ltr" className="font-label text-[11px] text-foreground-600">{session.ip || '—'}</span>
                    </td>
                    <td className="py-2 pe-3">
                      <span className="block font-label text-[11px] text-foreground-600 whitespace-nowrap">{when(session.lastSeenAt)}</span>
                      <span className="block text-[10px] text-foreground-500 whitespace-nowrap">
                        {t('auth_sessions_since', { date: when(session.createdAt) })}
                      </span>
                    </td>
                    <td className="py-2 text-end">
                      {self ? (
                        <span className="font-label text-[10px] uppercase tracking-widest text-primary-700 dark:text-primary-300 whitespace-nowrap">
                          {t('auth_sessions_you')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRevoke(session)}
                          disabled={revoking === session.userId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-accent-300 text-accent-800 text-xs font-semibold whitespace-nowrap cursor-pointer hover:bg-accent-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <i className={revoking === session.userId ? 'ri-loader-4-line animate-spin' : 'ri-logout-circle-r-line'} />
                          {t('auth_sessions_revoke')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
