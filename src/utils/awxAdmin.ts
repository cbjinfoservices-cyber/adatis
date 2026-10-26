import { api } from '@/utils/api';
import type { I18nText } from '@/types/catalog';

export type AwxTemplateKind = 'none' | 'job' | 'workflow';

export type AwxTemplateOption = {
  id: number;
  kind: 'job' | 'workflow';
  name: string;
  description?: string;
  organization?: string;
};

export type AwxTemplateCatalog = {
  templates: AwxTemplateOption[];
  workflows: AwxTemplateOption[];
  available: boolean;
  reason?: 'auth_disabled' | 'no_token' | 'awx_unreachable' | string;
};

export type AdminServiceItem = {
  id: string;
  name: I18nText;
  icon: string;
  category: string;
  approval: string;
  kind: AwxTemplateKind;
  templateId: number | null;
  templateName: string;
  jobTemplateId: number | null;
  workflowTemplateId: number | null;
};

export type AwxWorkflowNode = {
  id: number;
  name: string;
  type: string;
  status: string;
  jobId: number | null;
  jobUrl: string;
  startedAt: string | null;
  finishedAt: string | null;
  elapsed: number;
  failed: boolean;
};

export type AwxWorkflowPayload = {
  nodes: AwxWorkflowNode[];
  jobId: number;
  jobUrl: string;
};

export const fetchAdminServices = () => api.get<{ items: AdminServiceItem[] }>('/admin/services');

export const fetchAwxTemplates = () => api.get<AwxTemplateCatalog>('/admin/awx/templates');

export const saveServiceTemplate = (id: string, body: { kind: AwxTemplateKind; templateId?: number | null }) => (
  api.patch<AdminServiceItem>(`/admin/services/${id}`, body)
);

export const fetchAwxWorkflowNodes = (requestId: string) => (
  api.get<AwxWorkflowPayload>(`/requests/${requestId}/awx/workflow`)
);

export const templateOptionsOf = (catalog: AwxTemplateCatalog | null, kind: AwxTemplateKind) => {
  if (!catalog) return [];
  if (kind === 'job') return catalog.templates;
  if (kind === 'workflow') return catalog.workflows;
  return [];
};