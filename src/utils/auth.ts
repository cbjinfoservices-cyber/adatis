import { API_BASE, api } from '@/utils/api';

export type PortalRole = 'admin' | 'approver' | 'requester';

export type AuthMode = 'awx' | 'disabled';

export type AuthUser = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: PortalRole;
  roleFr: string;
  roleEn: string;
  tenantId: string | null;
  awxUsername: string;
  awxUserId: number | null;
  authProvider: string;
  organizations: string[];
  teams: string[];
  lastLoginAt: string | null;
};

export type AuthConfig = {
  mode: AuthMode;
  provider: string;
  configured: boolean;
  loginUrl: string;
  redirectUri: string;
  scopes: string;
  sessionHours: number;
  checks: {
    baseUrl: boolean;
    clientId: boolean;
    clientSecret: boolean;
    redirectUri: boolean;
  };
  adminUsernames: number;
};

export type AuthMe = {
  mode: AuthMode;
  authenticated: boolean;
  user: AuthUser | null;
  permissions: {
    canAdmin: boolean;
    canApprove: boolean;
    canViewAdmin: boolean;
    canRequest: boolean;
  };
  awx: {
    connected: boolean;
    username?: string;
    accessExpiresAt?: string | null;
    refreshExpiresAt?: string | null;
    needsRefresh?: boolean;
    hasRefreshToken?: boolean;
  };
  session?: {
    expiresAt: string;
    lastSeenAt: string;
  };
};

export type AwxIdentity = {
  username: string;
  email: string;
  isSuperuser: boolean;
  organizations: { id: number; name: string }[];
  teams: { id: number; name: string; organization: string }[];
  role: PortalRole;
};

export type RoleMapping = {
  id: number;
  awxOrg: string;
  awxTeam: string;
  role: PortalRole;
  note: string;
  createdAt: string;
};

export type MappingsPayload = {
  mappings: RoleMapping[];
  suggestions: { organizations: string[]; teams: string[] };
  roleCounts: Partial<Record<PortalRole, number>>;
};

export type AuthEvent = {
  id: number;
  at: string;
  kind: string;
  username: string;
  role: string;
  email: string;
  ip: string;
  detail: string;
};

export const ROLES: PortalRole[] = ['admin', 'approver', 'requester'];

export const fetchAuthConfig = () => api.get<AuthConfig>('/auth/config');

export const fetchMe = () => api.get<AuthMe>('/auth/me');

export const signOutRequest = () => api.post<{ ok: boolean }>('/auth/logout');

export const refreshAwxToken = () => api.post<{ ok: boolean; accessExpiresAt: string }>('/auth/refresh');

export const fetchAwxIdentity = () => api.get<AwxIdentity>('/auth/identity');

export const fetchMappings = () => api.get<MappingsPayload>('/auth/mappings');

export const createMapping = (body: { awxOrg: string; awxTeam: string; role: PortalRole; note?: string }) => (
  api.post<RoleMapping>('/auth/mappings', body)
);

export const deleteMapping = (id: number) => api.delete<null>(`/auth/mappings/${id}`);

export const fetchAuthEvents = () => api.get<AuthEvent[]>('/auth/events');

/** URL de démarrage du SSO : redirection pleine page vers l'API. */
export const startLogin = (next?: string) => {
  const target = next && next.startsWith('/') ? `?next=${encodeURIComponent(next)}` : '';
  window.location.assign(`${API_BASE}/auth/login${target}`);
};

export const roleLabelKey = (role: PortalRole) => `auth_role_${role}`;