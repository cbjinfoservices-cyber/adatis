import type { I18nText } from '@/types/catalog';

export type AwxNotifStatus = 'success' | 'failed' | 'canceled';

export interface AwxNotif {
  id: string;
  requestId: string;
  jobId: number;
  status: AwxNotifStatus;
  service: I18nText;
  at: string;
  jobUrl: string;
}

const STORAGE_KEY = 'asp-awx-notifs';
export const AWX_NOTIF_EVENT = 'asp-awx-notif';

export const loadAwxNotifications = (): AwxNotif[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string' && typeof item.requestId === 'string');
  } catch {
    return [];
  }
};

const persist = (items: AwxNotif[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new CustomEvent(AWX_NOTIF_EVENT));
};

/** Ajoute une notification de fin de job, sans doublon. Retourne true si ajoutée. */
export const pushAwxNotification = (item: Omit<AwxNotif, 'id'>): boolean => {
  const id = `awx-${item.requestId}-${item.jobId}-${item.status}`;
  const current = loadAwxNotifications();
  if (current.some((entry) => entry.id === id)) return false;
  persist([{ ...item, id }, ...current]);
  return true;
};

export const clearAwxNotifications = () => {
  persist([]);
};

/** Snapshot des derniers états connus, pour détecter les fins de job. */
export interface AwxSnapshotEntry {
  status: string;
  jobId: number;
  service: I18nText;
  jobUrl: string;
  seenAt: string;
}

const SNAPSHOT_KEY = 'asp-awx-snapshot';

export const loadAwxSnapshot = (): Record<string, AwxSnapshotEntry> => {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const saveAwxSnapshot = (snapshot: Record<string, AwxSnapshotEntry>) => {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* stockage indisponible */
  }
};