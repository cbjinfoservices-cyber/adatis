import { api } from '@/utils/api';
import type { RequestItem } from '@/utils/executions';

/** Ligne du suivi agrégé : une demande du portail avec son job AWX. */
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
};

export type AwxJobsPayload = {
  items: AwxJobRow[];
  stats: AwxJobsStats;
  fetchedAt: string;
};

export type AwxJobsQuery = {
  status?: string;
  user?: string;
  search?: string;
  refresh?: boolean;
  limit?: number;
};

export const fetchAwxJobs = (params: AwxJobsQuery = {}) => {
  const search = new URLSearchParams();
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.user) search.set('user', params.user);
  if (params.search) search.set('search', params.search);
  if (params.refresh) search.set('refresh', '1');
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return api.get<AwxJobsPayload>(`/awx/jobs${qs ? `?${qs}` : ''}`);
};

/** Catégories de filtre = statuts portail (alignés sur les badges AWX). */
export const AWX_FILTER_STATUSES = ['all', 'queued', 'running', 'success', 'failed', 'canceled'] as const;