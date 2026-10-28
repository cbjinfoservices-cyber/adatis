import { useTranslation } from 'react-i18next';
import type { ToastMessage, ToastTone } from '@/hooks/useToast';

const TONE_ICON: Record<ToastTone, { icon: string; color: string }> = {
  info: { icon: 'ri-information-line', color: 'text-primary-300' },
  success: { icon: 'ri-checkbox-circle-fill', color: 'text-primary-300' },
  error: { icon: 'ri-error-warning-line', color: 'text-accent-400' },
};

/** Affiche le message de useToast() en bas de l'écran. */
export default function Toast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  const { t } = useTranslation();
  if (!toast) return null;
  const { icon, color } = TONE_ICON[toast.tone];
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-4 md:right-8 z-50 max-w-sm p-3.5 rounded-xl bg-foreground-950 text-background-50 shadow-lg flex items-start gap-2.5"
    >
      <span className={`w-5 h-5 flex items-center justify-center shrink-0 ${color}`}>
        <i className={icon} aria-hidden="true" />
      </span>
      <p className="text-sm">{toast.message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('admin_close')}
        className="ml-1 w-5 h-5 flex items-center justify-center shrink-0 text-background-300 hover:text-background-50 cursor-pointer"
      >
        <i className="ri-close-line" />
      </button>
    </div>
  );
}
