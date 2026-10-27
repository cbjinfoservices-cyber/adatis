import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import AdminTabs from '@/pages/admin/components/AdminTabs';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import ReadOnlyNotice from '@/components/base/ReadOnlyNotice';
import useReadOnly from '@/hooks/useReadOnly';
import { useAuth } from '@/hooks/useAuth';
import {
  createMapping, deleteMapping, fetchActiveSessions, fetchAuthEvents, fetchAwxIdentity, fetchMappings,
  revokeUserSessions,
  type ActiveSession, type AuthEvent, type AwxIdentity, type MappingsPayload, type PortalRole,
} from '@/utils/auth';
import AuthStatusCard from '@/pages/admin/auth/components/AuthStatusCard';
import AuthIdentityCard from '@/pages/admin/auth/components/AuthIdentityCard';
import AuthMappingsCard from '@/pages/admin/auth/components/AuthMappingsCard';
import AuthEventsCard from '@/pages/admin/auth/components/AuthEventsCard';
import AuthSessionsCard from '@/pages/admin/auth/components/AuthSessionsCard';

type Toast = { id: number; message: string; tone: 'info' | 'error' };

export default function AuthAdminPage() {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const {
    config, mode, user, refreshToken, reload: reloadAuth,
  } = useAuth();

  const [payload, setPayload] = useState<MappingsPayload | null>(null);
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [identity, setIdentity] = useState<AwxIdentity | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshState, setRefreshState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, tone: 'info' | 'error' = 'info') => {
    setToast({ id: Date.now(), message, tone });
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [mappings, nextEvents, nextSessions] = await Promise.all([
        fetchMappings(),
        fetchAuthEvents(),
        // Sessions actives : réservées aux administrateurs.
        mode === 'awx' && user?.role === 'admin' ? fetchActiveSessions() : Promise.resolve([]),
      ]);
      setPayload(mappings);
      setEvents(nextEvents);
      setSessions(nextSessions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : null);
    } finally {
      setLoading(false);
    }
  }, [mode, user?.role]);

  const loadIdentity = useCallback(async () => {
    setIdentityLoading(true);
    try {
      setIdentity(await fetchAwxIdentity());
      setIdentityError(false);
    } catch {
      setIdentity(null);
      setIdentityError(true);
    } finally {
      setIdentityLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (mode === 'awx') void loadIdentity();
    else setIdentityLoading(false);
  }, [load, loadIdentity, mode]);

  const handleCreate = async (body: { awxOrg: string; awxTeam: string; role: PortalRole; note: string }) => {
    setBusy(true);
    try {
      await createMapping(body);
      await load(true);
      notify(t('auth_mapping_saved'));
      return true;
    } catch {
      notify(t('auth_mapping_save_failed'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMapping(id);
      await load(true);
      notify(t('auth_mapping_deleted'));
    } catch {
      notify(t('auth_mapping_delete_failed'), 'error');
    }
  };

  const handleRevoke = async (session: ActiveSession) => {
    if (!window.confirm(t('auth_sessions_revoke_confirm', { name: session.name }))) return;
    setRevoking(session.userId);
    try {
      const result = await revokeUserSessions(session.userId);
      await load(true);
      notify(t('auth_sessions_revoked', { name: session.name, count: result.revoked }));
    } catch {
      notify(t('auth_sessions_revoke_failed'), 'error');
    } finally {
      setRevoking(null);
    }
  };

  const copy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notify(t('auth_copied'));
    } catch {
      notify(t('auth_copy_failed'), 'error');
    }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    const ok = await refreshToken();
    setRefreshState(ok ? 'ok' : 'error');
    setRefreshing(false);
    if (ok) {
      await reloadAuth();
      await loadIdentity();
    }
    window.setTimeout(() => setRefreshState('idle'), 3500);
  };

  const redirectUri = config?.redirectUri || '';

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('auth_page_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('auth_page_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            {mode === 'awx' && user && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background-100 border border-background-200 font-label text-[11px] text-foreground-700 whitespace-nowrap">
                <i className="ri-user-3-line" />
                {user.awxUsername || user.name}
              </span>
            )}
            <button
              type="button"
              onClick={() => { void load(); if (mode === 'awx') void loadIdentity(); }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
              {t('sys_refresh')}
            </button>
          </div>
        </header>

        <AdminTabs />

        <ReadOnlyNotice />

        {loading && !payload ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => { void load(); }} />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div className="lg:col-span-2 min-w-0">
                <AuthStatusCard config={config} redirectUri={redirectUri} onCopy={(value) => { void copy(value); }} />
              </div>
              <div className="min-w-0">
                <AuthIdentityCard
                  identity={identity}
                  loading={identityLoading}
                  error={identityError}
                  mode={mode}
                  role={user?.role ?? null}
                  onReload={() => { void loadIdentity(); }}
                  onRefreshToken={() => { void handleRefreshToken(); }}
                  refreshing={refreshing}
                  refreshState={refreshState}
                />
              </div>
            </div>

            <AuthMappingsCard
              mappings={payload?.mappings ?? []}
              suggestions={payload?.suggestions ?? { organizations: [], teams: [] }}
              roleCounts={payload?.roleCounts ?? {}}
              loading={loading}
              busy={busy}
              readOnly={readOnly}
              onCreate={handleCreate}
              onDelete={handleDelete}
            />

            {mode === 'awx' && user?.role === 'admin' && (
              <AuthSessionsCard
                sessions={sessions}
                loading={loading}
                currentUserId={user.id}
                revoking={revoking}
                onRevoke={(session) => { void handleRevoke(session); }}
              />
            )}

            <AuthEventsCard events={events} loading={loading} mode={mode} />
          </>
        )}
      </div>

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 md:right-8 z-50 max-w-sm p-3.5 rounded-xl bg-foreground-950 text-background-50 shadow-lg flex items-start gap-2.5"
        >
          <span className={`w-5 h-5 flex items-center justify-center shrink-0 ${toast.tone === 'error' ? 'text-accent-400' : 'text-primary-300'}`}>
            <i className={toast.tone === 'error' ? 'ri-error-warning-line' : 'ri-information-line'} />
          </span>
          <p className="text-sm">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label={t('adapt_close')}
            className="ml-1 w-5 h-5 flex items-center justify-center shrink-0 text-background-300 hover:text-background-50 cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>
      )}
    </AppShell>
  );
}