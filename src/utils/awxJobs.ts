import { api } from '@/utils/api';
import type { RequestItem } from '@/utils/executions';

/**
 * Ligne du suivi des jobs : une demande routée vers un moteur (type de
 * connecteur), avec son job Ascender s'il a été lancé. Les moteurs pas encore
 * branchés ont le statut « not_wired ».
 */
export type AwxJobRow = RequestItem & {
  jobKind: 'job' | 'workflow';
  awxStatus: string;
  portalStatus: string;
};

export type AwxJobsStats = {
  total: number;
  active: number;
  success: number;
  failed: number;
  notWired: number;
};

export type EngineStats = AwxJobsStats & { wired: boolean };

export type AwxJobsPayload = {
  items: AwxJobRow[];
  stats: AwxJobsStats;
  /** Statistiques par type de connecteur (ascender, jenkins…). */
  byKind: Record<string, EngineStats>;
  /** Types présents : connecteurs configurés et moteurs vus dans les demandes. */
  kinds: string[];
  fetchedAt: string;
};

export type AwxJobsQuery = {
  status?: string;
  user?: string;
  search?: string;
  kind?: string;
  refresh?: boolean;
  limit?: number;
};

export const NOT_WIRED = 'not_wired';

export const fetchAwxJobs = (params: AwxJobsQuery = {}) => {
  const search = new URLSearchParams();
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.user) search.set('user', params.user);
  if (params.search) search.set('search', params.search);
  if (params.kind && params.kind !== 'all') search.set('kind', params.kind);
  if (params.refresh) search.set('refresh', '1');
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<AwxJobsPayload>(`/jobs${qs ? `?${qs}` : ''}`);
};

/** Moteur d'une ligne (les jobs historiques sans moteur sont des jobs Ascender). */
export const engineOf = (row: Pick<RequestItem, 'engine'>) => row.engine?.kind || 'ascender';

/** Catégories de filtre = statuts portail (alignés sur les badges AWX). */
export const AWX_FILTER_STATUSES = ['all', 'queued', 'running', 'success', 'failed', 'canceled', NOT_WIRED] as const;
