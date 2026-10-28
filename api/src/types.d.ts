// Types partagés de l'API, lus par `npm run type-check` (JavaScript vérifié
// via JSDoc). Aucun effet à l'exécution : Node ne charge pas ce fichier.

/** Utilisateur connecté, construit par sessionUser() (auth.js). */
export interface SessionUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: 'admin' | 'approver' | 'requester' | string;
  roleFr: string;
  roleEn: string;
  tenantId: string | null;
  awxUsername: string;
  awxUserId: number | null;
  authProvider: string;
  organizations: unknown[];
  teams: unknown[];
  lastLoginAt: string | null;
  [key: string]: unknown;
}

/** Contexte d'authentification attaché à chaque requête par attachSession(). */
export interface RequestAuth {
  mode: string;
  session: any;
  user: SessionUser | null;
  token: string;
  expired?: boolean;
}

/** Erreur portant le statut HTTP (et éventuellement la réponse) d'un service appelé. */
export interface HttpError extends Error {
  status?: number;
  code?: string;
  awx?: unknown;
}

declare global {
  namespace Express {
    interface Request {
      auth: RequestAuth;
    }
  }
}
