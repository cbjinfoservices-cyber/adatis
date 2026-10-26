import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RETENTION_OPTIONS,
  updateSystemSettings,
  type SystemSettings,
} from '@/utils/system';

interface Props {
  settings: SystemSettings;
  readOnly?: boolean;
  onSaved: (settings: SystemSettings) => void;
  notify: (message: string, tone?: 'info' | 'error') => void;
}

const emailValid = (value: string) => value.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export default function SystemSettingsCard({
  settings, readOnly = false, onSaved, notify,
}: Props) {
  const { t } = useTranslation();
  const [retentionDays, setRetentionDays] = useState(String(settings.retentionDays));
  const [threshold, setThreshold] = useState(String(settings.alertThresholdPct));
  const [email, setEmail] = useState(settings.alertEmail ?? '');
  const [alertsEnabled, setAlertsEnabled] = useState(settings.alertsEnabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRetentionDays(String(settings.retentionDays));
    setThreshold(String(settings.alertThresholdPct));
    setEmail(settings.alertEmail ?? '');
    setAlertsEnabled(settings.alertsEnabled);
  }, [settings]);

  const dirty = useMemo(() => (
    Number(retentionDays) !== settings.retentionDays
    || Number(threshold) !== settings.alertThresholdPct
    || email.trim() !== (settings.alertEmail ?? '')
    || alertsEnabled !== settings.alertsEnabled
  ), [retentionDays, threshold, email, alertsEnabled, settings]);

  const retentionOptions = useMemo(() => {
    const values = Array.from(new Set([...RETENTION_OPTIONS, settings.retentionDays]));
    return values.sort((a, b) => a - b);
  }, [settings.retentionDays]);

  const save = async () => {
    const days = Number(retentionDays);
    const thresholdValue = Number(threshold);

    if (!Number.isFinite(days) || days < 1 || days > 90) {
      notify(t('sys_set_invalid_retention'), 'error');
      return;
    }
    if (!Number.isFinite(thresholdValue) || thresholdValue < 50 || thresholdValue > 100) {
      notify(t('sys_set_invalid_threshold'), 'error');
      return;
    }
    if (!emailValid(email)) {
      notify(t('sys_set_invalid_email'), 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await updateSystemSettings({
        retentionDays: days,
        alertThresholdPct: thresholdValue,
        alertEmail: email.trim(),
        alertsEnabled,
      });
      onSaved(result.settings);
      notify(t('sys_set_saved'));
    } catch {
      notify(t('sys_set_error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 p-4 md:p-5 flex flex-col">
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-secondary-100 text-secondary-800 dark:text-secondary-900 flex items-center justify-center shrink-0">
          <i className="ri-settings-3-line" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('sys_set_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">{t('sys_set_hint')}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        <div>
          <label htmlFor="sys-retention" className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
            {t('sys_set_retention')}
          </label>
          <select
            id="sys-retention"
            value={retentionDays}
            disabled={readOnly}
            onChange={(event) => setRetentionDays(event.target.value)}
            className="mt-1 w-full box-border min-w-0 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {retentionOptions.map((days) => (
              <option key={days} value={String(days)}>
                {t('sys_set_retention_days', { count: days })}
              </option>
            ))}
          </select>
          <p className="mt-1 font-label text-[10px] text-foreground-500">{t('sys_set_retention_hint')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor="sys-threshold" className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
              {t('sys_set_threshold')}
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                id="sys-threshold"
                type="number"
                min={50}
                max={100}
                step={0.5}
                value={threshold}
                disabled={readOnly}
                onChange={(event) => setThreshold(event.target.value)}
                className="w-full box-border min-w-0 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <span className="font-label text-xs text-foreground-500 shrink-0">%</span>
            </div>
          </div>

          <div className="min-w-0">
            <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
              {t('sys_set_email')}
            </span>
            <input
              type="email"
              name="alert_email"
              value={email}
              disabled={readOnly}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('sys_set_email_placeholder')}
              className="mt-1 w-full box-border min-w-0 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <p className="font-label text-[10px] text-foreground-500">{t('sys_set_threshold_hint')}</p>

        <label className={`flex items-start gap-2.5 p-2.5 rounded-lg bg-background-100 border border-background-200 ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={alertsEnabled}
            disabled={readOnly}
            onChange={(event) => setAlertsEnabled(event.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary-500 cursor-pointer shrink-0 disabled:cursor-not-allowed"
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-foreground-900">{t('sys_set_alerts_toggle')}</span>
            <span className="block font-label text-[10px] text-foreground-500 mt-0.5">{t('sys_set_email_hint')}</span>
          </span>
        </label>

        {!settings.emailConfigured && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-accent-300 bg-accent-100">
            <span className="w-4 h-4 flex items-center justify-center shrink-0 text-accent-900">
              <i className="ri-error-warning-line text-sm" aria-hidden="true" />
            </span>
            <p className="font-label text-[10px] text-accent-900 leading-relaxed">{t('sys_set_email_missing')}</p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={!dirty || saving || readOnly}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 text-background-50 text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'} aria-hidden="true" />
          {saving ? t('sys_set_saving') : t('sys_set_save')}
        </button>
        {dirty && !readOnly && (
          <span className="font-label text-[10px] text-accent-800 dark:text-accent-500">{t('sys_set_unsaved')}</span>
        )}
      </div>
    </section>
  );
}