/**
 * Client HTTP unique du portail.
 * L'URL de l'API est injectée au build : /api en Kubernetes (Ingress),
 * ou VITE_PUBLIC_API_URL pour un environnement de développement.
 */

const RAW_BASE = (import.meta.env.VITE_PUBLIC_API_URL as string | undefined) || '/api';

export const API_BASE = RAW_BASE.replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;

  detail?: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

const parse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async <T>(path: string, init?: Parameters<typeof fetch>[1]): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (cause) {
    throw new ApiError("Impossible de joindre l'API", 0, cause);
  }

  const payload = await parse(response);
  if (!response.ok) {
    throw new ApiError(`Requête ${path} refusée`, response.status, payload);
  }
  return payload as T;
};

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export const query = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};