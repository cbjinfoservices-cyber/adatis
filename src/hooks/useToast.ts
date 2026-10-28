import { useCallback, useEffect, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_DURATION_MS = 4200;

/** Message éphémère d'une page : `notify` l'affiche, il disparaît seul après quelques secondes. */
export default function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, notify, dismiss };
}
