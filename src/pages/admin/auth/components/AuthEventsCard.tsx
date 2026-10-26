import { useTranslation } from 'react-i18next';
import type { AuthEvent, AuthMode } from '@/utils/auth';

const KIND_STYLES: Record<string, { icon: string; className: string; key: string }> = {
  login_ok: { icon: 'ri-shield-check-line', className: 'text-primary-700 dark:text-primary-300 bg-primary-500/10', key: 'auth_event_login_ok' },
  login_failed: { icon: 'ri-shield-cross-line', className: 'text-accent-700 bg-accent-100', key: 'auth_event_login_failed' },
  logout: { icon: 'ri-logout-box-r-line', className: 'text-foreground-600 bg-background-200', key: 'auth_event_logout' },
  mapping_saved: { icon: 'ri-route-line', className: 'text-secondary-900 bg-secondary-100', key: 'auth_event_mapping_saved' },
};

export default function AuthEventsCard({
  events, loading, mode,
}: { events: AuthEvent[]; loading: boolean; mode: AuthMode }) {
  const { t, i18n } = useTranslation();

  return (
    <section className="rounded-xl border border-background-200 bg-background-50 p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold text-foreground-950">{t('auth_events_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">{t('auth_events_subtitle')}</p>
        </div>
        <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">
          {t('auth_events_count', { count: events.length })}
        </span>
      </header>

      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((row) => <div key={row} className="h-9 rounded-lg bg-background-100 animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-background-300 bg-background-100 px-3 py-6 text-center text-xs text-foreground-500">
          {mode === 'awx' ? t('auth_events_empty') : t('auth_events_empty_disabled')}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-background-200">
                <th className="py-1.5 pe-3 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_event_col_kind')}</th>
                <th className="py-1.5 pe-3 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_event_col_user')}</th>
                <th className="py-1.5 pe-3 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_event_col_ip')}</th>
                <th className="py-1.5 font-label text-[10px] uppercase tracking-widest text-foreground-500 whitespace-nowrap">{t('auth_event_col_at')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const meta = KIND_STYLES[event.kind] || {
                  icon: 'ri-information-line', className: 'text-foreground-700 bg-background-200', key: '',
                };
                return (
                  <tr key={event.id} className="border-b last:border-0 border-background-100">
                    <td className="py-2 pe-3">
                      <span className={`inline-flex items-center gap-1.5 font-label text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${meta.className}`}>
                        <i className={meta.icon} />
                        {meta.key ? t(meta.key) : event.kind}
                      </span>
                      {event.detail && (
                        <span className="block mt-0.5 text-[10px] text-foreground-500 truncate max-w-[220px]">{event.detail}</span>
                      )}
                    </td>
                    <td className="py-2 pe-3 min-w-0">
                      <span className="block text-xs text-foreground-900 truncate max-w-[160px]">{event.username || '—'}</span>
                      {event.role && <span className="block text-[10px] text-foreground-500">{event.role}</span>}
                    </td>
                    <td className="py-2 pe-3">
                      <span dir="ltr" className="font-label text-[11px] text-foreground-600">{event.ip || '—'}</span>
                    </td>
                    <td className="py-2">
                      <span className="font-label text-[11px] text-foreground-600 whitespace-nowrap">
                        {new Date(event.at).toLocaleString(i18n.language, {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
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