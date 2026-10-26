import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { tx } from '@/utils/catalog';
import type { LogLine } from '@/utils/executions';

const LEVEL: Record<string, { icon: string; cls: string }> = {
  info: { icon: 'ri-information-line', cls: 'text-foreground-500' },
  success: { icon: 'ri-checkbox-circle-line', cls: 'text-primary-600 dark:text-primary-300' },
  warning: { icon: 'ri-alert-line', cls: 'text-accent-600' },
  error: { icon: 'ri-close-circle-line', cls: 'text-accent-700' },
};

export default function ExecutionLogs({ logs }: { logs: LogLine[] }) {
  const { t, i18n } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [logs.length]);

  return (
    <section className="rounded-xl overflow-hidden border border-foreground-900 bg-foreground-950 text-background-50">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-background-50/10">
        <span className="w-5 h-5 flex items-center justify-center"><i className="ri-terminal-box-line text-primary-400" /></span>
        <h2 className="font-label text-[11px] uppercase tracking-widest opacity-80">{t('exec_logs')}</h2>
        <span className="ml-auto flex items-center gap-1.5 font-label text-[10px] uppercase tracking-wider text-primary-300">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />{t('exec_live')}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-1.5 font-label text-[11px] leading-relaxed">
        {logs.map((l, i) => (
          <div key={`${l.time}-${i}`} className="flex gap-2 asp-rise">
            <span className="opacity-40 shrink-0">{l.time}</span>
            <span className={`w-4 h-4 flex items-center justify-center shrink-0 ${LEVEL[l.level].cls}`}><i className={LEVEL[l.level].icon} /></span>
            <span className="opacity-90">{tx(l.text, i18n.language)}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}