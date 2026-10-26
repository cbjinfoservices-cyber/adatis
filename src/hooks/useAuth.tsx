import { createContext, useContext } from 'react';
import type {
  AuthConfig, AuthMe, AuthMode, AuthUser,
} from '@/utils/auth';

export type Permissions = AuthMe['permissions'];

export type AuthContextValue = {
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

export const EMPTY_PERMISSIONS: Permissions = {
  canAdmin: false, canApprove: false, canViewAdmin: false, canRequest: true,
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return context;
}