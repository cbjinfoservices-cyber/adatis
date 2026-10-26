import { useTranslation } from 'react-i18next';
import type { SystemAlert, SystemLastHour, SystemSettings } from '@/utils/system';

interface Props {
  settings: SystemSettings;
  lastHour: SystemLastHour;
  alerts: SystemAlert[];
}

const formatWindow = (iso: string, language: string) => new Date(iso).toLocaleString(language, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const uptimeTone = (pct: number | null, threshold: number) => {
  if (pct === null) return 'text-foreground-600';
  if (pct >= threshold) return 'text-primary-700 dark:text-primary-400';
  return 'text-accent-800 dark:text-accent-500';
};

export default function SystemAlertsCard({ settings, lastHour, alerts }: Props) {
  const { t, i18n } = useTranslation();

  const lastHourPct = lastHour.uptimePct;
  const barWidth = lastHourPct === null ? 0 : Math.max(0, Math.min(100, lastHourPct));

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 p-4 md:p-5 flex flex-col">
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-accent-100 text-accent-900 flex items-center justify-center shrink-0">
          <i className="ri-alarm-warning-line" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('sys_alert_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">
            {t('sys_alert_hint', { threshold: settings.alertThresholdPct })}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label text-[10px] ${settings.alertsEnabled ? 'bg-primary-100 text-primary-800 dark:text-primary-900' : 'bg-background-200 text-foreground-700'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${settings.alertsEnabled ? 'bg-primary-500' : 'bg-foreground-400'}`} aria-hidden="true" />
          {settings.alertsEnabled ? t('sys_alert_on') : t('sys_alert_off')}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-background-200 bg-background-100/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
            {t('sys_alert_last_hour')}
          </span>
          <span className={`font-heading text-lg font-bold leading-none tabular-nums ${uptimeTone(lastHourPct, settings.alertThresholdPct)}`}>
            {lastHourPct === null ? '—' : `${lastHourPct.toFixed(1)} %`}
          </span>
        </div>

        <div className="mt-2 h-1.5 w-full rounded-full bg-background-200 overflow-hidden">
          <span
            className={`block h-full rounded-full ${lastHourPct !== null && lastHourPct < settings.alertThresholdPct ? 'bg-accent-500' : 'bg-primary-500'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-label text-[10px] text-foreground-500">
          <span dir="ltr">{formatWindow(lastHour.windowStart, i18n.language)} → {formatWindow(lastHour.windowEnd, i18n.language)}</span>
          <span>{t('sys_alert_checks', { count: lastHour.checks })}</span>
          {lastHour.downChecks > 0 && (
            <span className="text-accent-800 dark:text-accent-500">{t('sys_avail_down_checks', { count: lastHour.downChecks })}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-label text-[10px] text-foreground-500">
        <span className="inline-flex items-center gap-1 min-w-0">
          <i className="ri-mail-send-line" aria-hidden="true" />
          <span className="truncate" title={settings.alertEmail ?? undefined} dir="ltr">
            {settings.alertEmail || t('sys_alert_no_recipient')}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <i className={settings.emailConfigured ? 'ri-checkbox-circle-line text-primary-600' : 'ri-error-warning-line text-accent-700'} aria-hidden="true" />
          {settings.emailConfigured ? t('sys_alert_email_ready') : t('sys_alert_email_unconfigured')}
        </span>
      </div>

      <div className="mt-3 flex-1">
        <h3 className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
          {t('sys_alert_history', { count: alerts.length })}
        </h3>

        {alerts.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-background-300 bg-background-100 px-3 py-4 text-xs text-foreground-500 text-center">
            {t('sys_alert_empty')}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-background-200">
            {alerts.map((alert) => (
              <li key={alert.id} className="py-2 flex items-start gap-2">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${alert.emailSent ? 'bg-primary-500' : 'bg-accent-500'}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-heading text-sm font-bold text-accent-800 dark:text-accent-500 tabular-nums">
                      {alert.uptimePct.toFixed(1)} %
                    </span>
                    <span className="font-label text-[10px] text-foreground-500" dir="ltr">
                      {formatWindow(alert.windowStart, i18n.language)} → {formatWindow(alert.windowEnd, i18n.language)}
                    </span>
                  </div>
                  <p className="font-label text-[10px] text-foreground-500 mt-0.5">
                    {t('sys_alert_line_meta', { threshold: alert.thresholdPct, checks: alert.checks, down: alert.downChecks })}
                  </p>
                  <p className={`font-label text-[10px] mt-0.5 ${alert.emailSent ? 'text-primary-700 dark:text-primary-400' : 'text-accent-800 dark:text-accent-500'}`}>
                    {alert.emailSent
                      ? t('sys_alert_sent', { to: alert.recipient || '—' })
                      : t('sys_alert_not_sent', { reason: alert.emailError || '—' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}