import type { I18nText } from '@/types/catalog';

export type Risk = 'low' | 'medium' | 'high';
export type LevelStatus = 'approved' | 'rejected' | 'current' | 'waiting' | 'skipped';
export type Decision = 'pending' | 'approved' | 'rejected';

export interface ApprovalLevel {
  key: string;
  status: LevelStatus;
  approver?: string;
  decidedAt?: string;
  comment?: I18nText;
}

export interface ApprovalItem {
  id: string;
  requestId: string;
  serviceId: string;
  service: I18nText;
  category: string;
  user: string;
  initials: string;
  role: I18nText;
  tenant: string;
  environment: string;
  submittedAt: string;
  dueAt: string;
  risk: Risk;
  myTurn: boolean;
  decision: Decision;
  decidedAt?: string;
  justification: I18nText;
  impacts: I18nText[];
  levels: ApprovalLevel[];
}

export const RISK_STYLE: Record<Risk, { cls: string; icon: string }> = {
  low: { cls: 'bg-primary-100 text-primary-800 dark:text-primary-900', icon: 'ri-shield-check-line' },
  medium: { cls: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900', icon: 'ri-error-warning-line' },
  high: { cls: 'bg-accent-100 text-accent-900', icon: 'ri-alert-line' },
};

export const LEVEL_STYLE: Record<LevelStatus, { cls: string; icon: string }> = {
  approved: { cls: 'bg-primary-500 text-background-50 dark:text-foreground-950', icon: 'ri-check-line' },
  rejected: { cls: 'bg-accent-600 text-background-50 dark:text-foreground-950', icon: 'ri-close-line' },
  current: { cls: 'bg-secondary-500 text-background-50 dark:text-foreground-950', icon: 'ri-time-line' },
  waiting: { cls: 'bg-background-200 text-foreground-500', icon: 'ri-more-line' },
  skipped: { cls: 'bg-background-200 text-foreground-400', icon: 'ri-skip-forward-line' },
};

export const levelLabelKey = (key: string) => `appr_level_${key}`;

export const currentLevel = (item: ApprovalItem) => item.levels.find((l) => l.status === 'current');

export const remainingLevels = (item: ApprovalItem) =>
  item.levels.filter((l) => l.status === 'waiting').length;

/** Heures restantes avant l'échéance (négatif = dépassé). */
export const hoursLeft = (dueAt: string, now = Date.now()) => {
  const diff = new Date(dueAt).getTime() - now;
  return Math.round(diff / 3600000);
};

export const isUrgent = (item: ApprovalItem) => item.decision === 'pending' && hoursLeft(item.dueAt) <= 3;

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actorRole: I18nText;
  level: string;
  decision: 'approved' | 'rejected';
  service: I18nText;
  ref: string;
  tenant: string;
  comment?: I18nText;
  risk: Risk;
}

const ACTOR_ROLE: Record<string, I18nText> = {
  manager: { fr: 'Manager', en: 'Manager' },
  technical: { fr: 'Équipe technique', en: 'Technical team' },
  security: { fr: 'Équipe sécurité', en: 'Security team' },
  platform: { fr: 'Équipe plateforme', en: 'Platform team' },
};

/** Construit le journal d'audit à partir des circuits de validation + de l'historique archivé. */
export const buildAuditEntries = (items: ApprovalItem[], history: AuditEntry[]): AuditEntry[] => {
  const fromItems: AuditEntry[] = [];
  items.forEach((item) => {
    item.levels.forEach((level) => {
      if (!level.approver || !level.decidedAt) return;
      if (level.status !== 'approved' && level.status !== 'rejected') return;
      fromItems.push({
        id: `${item.id}-${level.key}`,
        at: level.decidedAt,
        actor: level.approver,
        actorRole: ACTOR_ROLE[level.key] || { fr: 'Approbateur', en: 'Approver' },
        level: level.key,
        decision: level.status === 'approved' ? 'approved' : 'rejected',
        service: item.service,
        ref: item.requestId,
        tenant: item.tenant,
        comment: level.comment,
        risk: item.risk,
      });
    });
  });
  const seen = new Set(fromItems.map((e) => `${e.ref}-${e.level}-${e.at}`));
  const extra = history.filter((e) => !seen.has(`${e.ref}-${e.level}-${e.at}`));
  return [...fromItems, ...extra].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
};