import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import AdminTabs from '@/pages/admin/components/AdminTabs';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import ReadOnlyNotice from '@/components/base/ReadOnlyNotice';
import useReadOnly from '@/hooks/useReadOnly';
import SystemOverview from '@/pages/admin/system/components/SystemOverview';
import SystemDatabaseCard from '@/pages/admin/system/components/SystemDatabaseCard';
import SystemMigrationsTable from '@/pages/admin/system/components/SystemMigrationsTable';
import SystemAvailability from '@/pages/admin/system/components/SystemAvailability';
import SystemSettingsCard from '@/pages/admin/system/components/SystemSettingsCard';
import SystemAlertsCard from '@/pages/admin/system/components/SystemAlertsCard';
import SystemAuditCard from '@/pages/admin/system/components/SystemAuditCard';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/utils/api';
import { fetchSystemInfo, type SystemInfo, type SystemSettings } from '@/utils/system';
import { buildDiagnostic, copyToClipboard, migrationsCsvFileName, migrationsToCsv } from '@/utils/systemDiagnostic';
import { downloadCsv } from '@/utils/download';
import Toast from '@/components/base/Toast';
import useToast from '@/hooks/useToast';

export default function SystemPage() {
  const { t, i18n } = useTranslation();
  const readOnly = useReadOnly();
  const { mode, user } = useAuth();
  // Journal d'audit : administrateurs uniquement (l'API refuse les autres rôles).
  const canReadAudit = mode === 'disabled' || user?.role === 'admin';
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, notify, dismiss } = useToast();

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchSystemInfo();
      setInfo(data);
      setError(null);
    } catch (err) {
      setInfo(null);
      setError(err instanceof ApiError ? err.message : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyDiagnostic = async () => {
    if (!info) return;
    setCopying(true);
    try {
      const text = buildDiagnostic(info, t, i18n.language);
      const ok = await copyToClipboard(text);
      notify(ok ? t('sys_diag_copied') : t('sys_diag_copy_failed'), ok ? 'info' : 'error');
    } catch {
      notify(t('sys_diag_copy_failed'), 'error');
    } finally {
      setCopying(false);
    }
  };

  const handleSettingsSaved = (next: SystemSettings) => {
    setInfo((previous) => (previous ? { ...previous, settings: next } : previous));
  };

  const exportMigrations = () => {
    if (!info || info.migrations.length === 0) {
      notify(t('sys_mig_export_empty'), 'error');
      return;
    }
    const file = migrationsCsvFileName();
    downloadCsv(file, migrationsToCsv(info.migrations, t, i18n.language));
    notify(t('sys_mig_export_done', { file }));
  };

  const checkedLabel = info
    ? new Date(info.checkedAt).toLocaleString(i18n.language, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    : null;

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('sys_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('sys_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            {checkedLabel && (
              <span className="font-label text-[11px] text-foreground-500 whitespace-nowrap">
                {t('sys_checked_at', { date: checkedLabel })}
              </span>
            )}
            <button
              type="button"
              onClick={() => { void copyDiagnostic(); }}
              disabled={!info || copying}
              title={t('sys_diag_copy_hint')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={copying ? 'ri-loader-4-line animate-spin' : 'ri-file-copy-2-line'} />
              {copying ? t('sys_diag_copying') : t('sys_diag_copy')}
            </button>
            <button
              type="button"
              onClick={() => { void load(true); }}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={refreshing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
              {refreshing ? t('sys_refreshing') : t('sys_refresh')}
            </button>
          </div>
        </header>

        <AdminTabs />

        <ReadOnlyNotice />

        {loading && !info ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => { void load(); }} />
        ) : info ? (
          <>
            {info.status === 'degraded' && (
              <div className="rounded-xl border border-accent-300 bg-accent-100 px-4 py-3 flex items-start gap-2.5">
                <span className="w-5 h-5 flex items-center justify-center shrink-0 text-accent-900">
                  <i className="ri-error-warning-line" />
                </span>
                <p className="text-xs text-accent-900 leading-relaxed">{t('sys_error_hint')}</p>
              </div>
            )}
            <SystemOverview info={info} />
            {info.history && <SystemAvailability history={info.history} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SystemSettingsCard
                settings={info.settings}
                readOnly={readOnly}
                onSaved={handleSettingsSaved}
                notify={notify}
              />
              <SystemAlertsCard settings={info.settings} lastHour={info.lastHour} alerts={info.alerts} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SystemDatabaseCard info={info} />
              <SystemMigrationsTable
                migrations={info.migrations}
                checkedAt={info.checkedAt}
                onExport={exportMigrations}
              />
            </div>
            {canReadAudit && <SystemAuditCard />}
          </>
        ) : null}
      </div>

      <Toast toast={toast} onClose={dismiss} />
    </AppShell>
  );
}