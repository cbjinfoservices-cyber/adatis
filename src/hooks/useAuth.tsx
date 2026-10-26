import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  fetchAuthConfig, fetchMe, refreshAwxToken, signOutRequest,
  type AuthConfig, type AuthMe, type AuthMode, type AuthUser,
} from '@/utils/auth';

type Permissions = AuthMe['permissions'];

type AuthContextValue = {
  config: AuthConfig | null;
  me: AuthMe | null;
  loading: boolean;
  error: string | null;
  mode: AuthMode;
  user: AuthUser | null;
  permissions: Permissions;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
};

const EMPTY_PERMISSIONS: Permissions = {
  canAdmin: false, canApprove: false, canViewAdmin: false, canRequest: true,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextConfig, nextMe] = await Promise.all([fetchAuthConfig(), fetchMe()]);
      setConfig(nextConfig);
      setMe(nextMe);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    try {
      await signOutRequest();
    } finally {
      setMe((previous) => (previous
        ? { ...previous, authenticated: false, user: null, permissions: EMPTY_PERMISSIONS }
        : previous));
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      await refreshAwxToken();
      await reload();
      return true;
    } catch {
      return false;
    }
  }, [reload]);

  const value = useMemo<AuthContextValue>(() => ({
    config,
    me,
    loading,
    error,
    mode: me?.mode || config?.mode || 'disabled',
    user: me?.user ?? null,
    permissions: me?.permissions ?? EMPTY_PERMISSIONS,
    reload,
    signOut,
    refreshToken,
  }), [config, me, loading, error, reload, signOut, refreshToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return context;
}