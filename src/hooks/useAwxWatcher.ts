import { useEffect, useRef } from 'react';
import { fetchAwxJobs } from '@/utils/awxJobs';
import {
  loadAwxSnapshot, pushAwxNotification, saveAwxSnapshot,
  type AwxNotifStatus, type AwxSnapshotEntry,
} from '@/utils/awxNotifications';

/**
 * Surveillance globale des jobs AWX.
 *
 * Toutes les 25 s, le portail relit les jobs (état tenu à jour côté serveur
 * par la synchronisation de fond) et détecte les passages d'un état actif
 * vers un état terminal. Si l'utilisateur n'est pas
 * sur la fiche de la demande concernée, une notification est déposée dans la
 * cloche. Le dernier état connu est conservé localement pour détecter aussi une
 * fin de job survenue après un rechargement de page.
 */

const POLL_MS = 25000;
const ACTIVE = ['new', 'pending', 'waiting', 'running', 'queued'];
const TERMINAL: Record<string, AwxNotifStatus> = {
  successful: 'success',
  failed: 'failed',
  error: 'failed',
  canceled: 'canceled',
};
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const isActive = (status: string) => ACTIVE.includes(String(status || '').toLowerCase());

export default function useAwxWatcher(enabled: boolean) {
  const snapshot = useRef<Record<string, AwxSnapshotEntry>>(loadAwxSnapshot());

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      try {
        const payload = await fetchAwxJobs({ limit: 60 });
        if (cancelled) return;

        const next: Record<string, AwxSnapshotEntry> = {};
        const now = Date.now();

        payload.items.forEach((item) => {
          const job = item.awx;
          if (!job) return;
          const raw = String(job.status || '').toLowerCase();
          next[item.id] = {
            status: raw,
            jobId: job.jobId,
            service: item.service,
            jobUrl: job.jobUrl,
            seenAt: new Date().toISOString(),
          };

          const previous = snapshot.current[item.id];
          const done = TERMINAL[raw];
          if (!done || !previous || !isActive(previous.status)) return;

          // Trop vieux : on ne notifie pas une fin de job très ancienne.
          if (now - new Date(previous.seenAt).getTime() > SNAPSHOT_MAX_AGE_MS) return;

          // L'utilisateur regarde déjà cette demande : pas de doublon.
          if (window.location.pathname === `/requests/${item.id}`) return;

          pushAwxNotification({
            requestId: item.id,
            jobId: job.jobId,
            status: done,
            service: item.service,
            at: new Date().toISOString(),
            jobUrl: job.jobUrl,
          });
        });

        snapshot.current = next;
        saveAwxSnapshot(next);
      } catch {
        /* AWX momentanément injoignable : la passe suivante réessaiera */
      }
    };

    void tick();
    timer = window.setInterval(() => { void tick(); }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);
}