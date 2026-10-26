import { hoursLeft, type ApprovalItem } from '@/utils/approvals';
import { tx } from '@/utils/catalog';
import type { RequestItem } from '@/utils/executions';
import type { AwxNotif } from '@/utils/awxNotifications';

export type NotifKind = 'execution' | 'approval';
export type NotifTone = 'success' | 'error' | 'info' | 'warning';

export interface NotifItem {
  id: string;
  kind: NotifKind;
  tone: NotifTone;
  titleKey: string;
  service: string;
  ref: string;
  href: string;
  at: string;
  detail?: string;
}

const EXEC_TITLES: Record<string, { key: string; tone: NotifTone }> = {
  success: { key: 'notif_exec_success_title', tone: 'success' },
  failed: { key: 'notif_exec_failed_title', tone: 'error' },
  running: { key: 'notif_exec_running_title', tone: 'info' },
  queued: { key: 'notif_exec_queued_title', tone: 'warning' },
  canceled: { key: 'notif_exec_canceled_title', tone: 'info' },
};

/** Agrège les exécutions et les approbations chargées depuis l'API en un flux unique. */
export const buildNotificationFeed = (
  lang: string,
  dueLabel: (h: number) => string,
  requests: RequestItem[],
  approvals: ApprovalItem[],
  limit?: number,
): NotifItem[] => {
  const executions: NotifItem[] = requests
    .filter((r) => Boolean(EXEC_TITLES[r.status]))
    .map((r) => {
      const meta = EXEC_TITLES[r.status];
      return {
        id: `exec-${r.id}`,
        kind: 'execution' as NotifKind,
        tone: meta.tone,
        titleKey: meta.key,
        service: tx(r.service, lang),
        ref: r.id,
        href: `/requests/${r.id}`,
        at: r.createdAt,
      };
    });

  const approvalFeed: NotifItem[] = approvals
    .filter((a) => a.decision === 'pending')
    .map((a) => {
      const h = hoursLeft(a.dueAt);
      return {
        id: `appr-${a.id}`,
        kind: 'approval' as NotifKind,
        tone: a.myTurn ? ('warning' as NotifTone) : ('info' as NotifTone),
        titleKey: a.myTurn ? 'notif_appr_turn_title' : 'notif_appr_title',
        service: tx(a.service, lang),
        ref: a.id,
        href: '/approvals',
        at: a.submittedAt,
        detail: a.myTurn ? dueLabel(h) : a.tenant,
      };
    });

  const feed = [...approvalFeed, ...executions]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return typeof limit === 'number' ? feed.slice(0, limit) : feed;
};

const AWX_TITLES: Record<AwxNotif['status'], { key: string; tone: NotifTone }> = {
  success: { key: 'notif_awx_success_title', tone: 'success' },
  failed: { key: 'notif_awx_failed_title', tone: 'error' },
  canceled: { key: 'notif_awx_canceled_title', tone: 'info' },
};

/**
 * Notifications de fin de job AWX, détectées en arrière-plan quand
 * l'utilisateur ne se trouve pas sur la fiche de la demande concernée.
 */
export const awxNotificationItems = (notifs: AwxNotif[], lang: string): NotifItem[] => notifs
  .filter((notif) => Boolean(AWX_TITLES[notif.status]))
  .map((notif) => {
    const meta = AWX_TITLES[notif.status];
    return {
      id: notif.id,
      kind: 'execution' as NotifKind,
      tone: meta.tone,
      titleKey: meta.key,
      service: tx(notif.service, lang),
      ref: notif.requestId,
      href: `/requests/${notif.requestId}`,
      at: notif.at,
      detail: notif.jobId ? `#${notif.jobId}` : undefined,
    };
  });

const READ_KEY = 'asp-notif-read';

export const loadReadIds = (): string[] => {
  try {
    const raw = localStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveReadIds = (ids: string[]) => {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids.slice(-120)));
  } catch {
    /* stockage indisponible */
  }
};