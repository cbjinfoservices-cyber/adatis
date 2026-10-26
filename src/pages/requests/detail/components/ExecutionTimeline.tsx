import { useTranslation } from 'react-i18next';
import type { TimelineStep } from '@/utils/executions';
import { tx } from '@/utils/catalog';

const DOT: Record<string, string> = {
  success: 'bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500',
  running: 'bg-accent-500 text-foreground-950 border-accent-500',
  failed: 'bg-accent-600 text-background-50 border-accent-600',
  pending: 'bg-background-50 text-foreground-400 border-background-300',
};

const ICON: Record<string, string> = {
  success: 'ri-check-line', running: 'ri-loader-4-line', failed: 'ri-close-line', pending: 'ri-circle-line',
};

export default function ExecutionTimeline({ steps }: { steps: TimelineStep[] }) {
  const { t, i18n } = useTranslation();
  return (
    <ol className="mt-4">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${s.status === 'success' ? 'bg-primary-500' : 'bg-background-300'}`} />
          )}
          <span className={`relative z-10 w-8 h-8 rounded-full border flex items-center justify-center text-xs shrink-0 ${DOT[s.status]}`}>
            <i className={`${ICON[s.status]} ${s.status === 'running' ? 'animate-spin' : ''}`} />
          </span>
          <span className="min-w-0 pt-0.5">
            <span className={`block text-sm font-medium ${s.status === 'pending' ? 'text-foreground-500' : 'text-foreground-950'}`}>{t(`step_${s.key}`)}</span>
            <span className="block text-xs text-foreground-500">{tx(s.note, i18n.language)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}