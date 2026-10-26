import { getStoreState } from '@/utils/store';
import { tx } from '@/utils/catalog';
import type { Lang, I18nText } from '@/types/catalog';

export type ExecutionStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled';

export interface TimelineStep { key: string; status: 'pending' | 'running' | 'success' | 'failed'; note: I18nText }
export interface LogLine { time: string; level: 'info' | 'success' | 'warning' | 'error'; text: I18nText }

export interface RequestResult {
  type: string;
  status: string;
  fields: { label: I18nText; value: string }[];
}

export interface RequestError {
  code: string;
  severity: string;
  reason: I18nText;
  solution: I18nText;
}

export interface RequestItem {
  id: string;
  serviceId: string;
  service: I18nText;
  category: string;
  user: string;
  initials: string;
  tenant: string;
  environment: string;
  status: ExecutionStatus;
  progress: number;
  createdAt: string;
  durationSec: number;
  approval: string;
  approvalState: string;
  awaitingRequester?: boolean;
  businessType: string;
  awx?: AwxJob | null;
}

/** Job AWX réellement lancé pour une demande, avec son lien direct. */
export interface AwxJob {
  jobId: number;
  jobUrl: string;
  kind: 'job' | 'workflow';
  templateId: number | null;
  templateName: string;
  status: string;
  startedAt: string | null;
  launchedBy: string;
}

/** Résultat du lancement tenté à la création de la demande. */
export interface AwxLaunchResult {
  jobId?: number;
  jobUrl?: string;
  templateId?: number;
  templateName?: string;
  status?: string;
  launchedBy?: string;
  skipped?: 'auth_disabled' | 'no_session' | 'no_template' | 'no_token' | 'rbac_forbidden';
  error?: string;
}

/** Couleur du badge d'état AWX. */
export const AWX_STATUS_STYLE: Record<string, string> = {
  new: 'bg-secondary-100 text-secondary-900',
  pending: 'bg-secondary-100 text-secondary-900',
  waiting: 'bg-secondary-100 text-secondary-900',
  running: 'bg-primary-100 text-primary-800 dark:text-primary-900',
  successful: 'bg-primary-100 text-primary-800 dark:text-primary-900',
  failed: 'bg-accent-100 text-accent-900',
  error: 'bg-accent-100 text-accent-900',
  canceled: 'bg-background-200 text-foreground-600',
};

export interface RequestDetailData {
  timeline: TimelineStep[];
  logs: LogLine[];
  result?: RequestResult;
  error?: RequestError;
}

/** Demande déjà chargée dans le store (liste « Mes demandes »). */
export const getRequest = (id?: string) => getStoreState().requests.find((r) => r.id === id);

export const serviceOf = (r: RequestItem) => getStoreState().services.find((s) => s.id === r.serviceId);

export const formatDuration = (sec: number, lang: string) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return lang.startsWith('en') ? `${m}m ${String(s).padStart(2, '0')}s` : `${m} min ${String(s).padStart(2, '0')} s`;
};

export const formatDate = (iso: string, lang: string) => {
  const d = new Date(iso);
  return d.toLocaleString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

/** Messages affichés pendant la simulation d'une exécution en cours. */
export const LIVE_LOG_TEMPLATES: { level: LogLine['level']; text: I18nText }[] = [
  { level: 'info', text: { fr: 'Application des rôles de configuration', en: 'Applying configuration roles' } },
  { level: 'success', text: { fr: 'Service système redémarré', en: 'System service restarted' } },
  { level: 'info', text: { fr: 'Vérification des dépendances réseau', en: 'Checking network dependencies' } },
  { level: 'success', text: { fr: 'Certificat TLS installé', en: 'TLS certificate installed' } },
  { level: 'warning', text: { fr: 'Reprise après un ralentissement du stockage', en: 'Retried after a storage slowdown' } },
  { level: 'success', text: { fr: 'Contrôles de conformité validés', en: 'Compliance checks validated' } },
];

export const STATUS_STYLE: Record<ExecutionStatus, { cls: string; icon: string }> = {
  queued: { cls: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900', icon: 'ri-time-line' },
  running: { cls: 'bg-primary-100 text-primary-800 dark:text-primary-900', icon: 'ri-loader-4-line' },
  success: { cls: 'bg-primary-100 text-primary-800 dark:text-primary-900', icon: 'ri-check-line' },
  failed: { cls: 'bg-accent-100 text-accent-900', icon: 'ri-close-line' },
  canceled: { cls: 'bg-background-200 text-foreground-600', icon: 'ri-forbid-line' },
};

export const businessLabel = (type: string, lang: Lang) => {
  const map: Record<string, I18nText> = {
    vm_creation: { fr: 'Serveur créé', en: 'Server created' },
    vm_update: { fr: 'Serveur modifié', en: 'Server updated' },
    vm_deletion: { fr: 'Serveur supprimé', en: 'Server deleted' },
    database_creation: { fr: 'Base de données créée', en: 'Database created' },
    database_restore: { fr: 'Sauvegarde restaurée', en: 'Backup restored' },
    dns_creation: { fr: 'Entrée DNS créée', en: 'DNS record created' },
    application_deployment: { fr: 'Application déployée', en: 'Application deployed' },
    application_rollback: { fr: 'Application restaurée', en: 'Application rolled back' },
    kubernetes_namespace: { fr: 'Namespace créé', en: 'Namespace created' },
    user_creation: { fr: 'Compte créé', en: 'Account created' },
    restore: { fr: 'Restauration terminée', en: 'Restore completed' },
    custom: { fr: 'Opération terminée', en: 'Operation completed' },
  };
  return tx(map[type] || map.custom, lang);
};