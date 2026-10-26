import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ApprovalBadge from '@/components/base/ApprovalBadge';
import type { ApprovalLevel, FieldValue } from '@/types/catalog';

const CHAIN: Record<ApprovalLevel, string[]> = {
  none: ['step_submit', 'step_exec'],
  manager: ['step_submit', 'step_manager', 'step_exec'],
  technical: ['step_submit', 'step_technical', 'step_exec'],
  security: ['step_submit', 'step_security', 'step_exec'],
  multi: ['step_submit', 'step_manager', 'step_technical', 'step_security', 'step_exec'],
};

interface Props { approval: ApprovalLevel; minutes: number; values: Record<string, FieldValue> }

export default function RequestSummary({ approval, minutes, values }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const safe = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, /password|token|secret/i.test(k) && v ? '••••••' : v]));

  return (
    <aside className="lg:sticky lg:top-24 space-y-4">
      <div className="p-5 rounded-xl bg-background-50 border border-background-200">
        <h2 className="font-heading font-semibold text-foreground-950">{t('summary_title')}</h2>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-foreground-600">{t('summary_eta')}</span>
          <span className="font-label font-semibold text-foreground-950">~{minutes} {t('minutes')}</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm gap-2">
          <span className="text-foreground-600">{t('summary_approval')}</span>
          <ApprovalBadge level={approval} />
        </div>
        <ol className="mt-5 relative">
          {CHAIN[approval].map((step, i, list) => (
            <li key={step} className="relative flex items-center gap-3 pb-4 last:pb-0">
              {i < list.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-background-300" />}
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-label ${i === 0 ? 'bg-primary-500 text-background-50 dark:text-foreground-950' : i === list.length - 1 ? 'bg-foreground-950 text-background-50' : 'bg-accent-100 text-accent-900'}`}>
                {i === list.length - 1 ? <i className="ri-flashlight-line" /> : i + 1}
              </span>
              <span className="text-sm text-foreground-800">{t(step)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="p-5 rounded-xl bg-foreground-950 text-background-50 dark:bg-background-200 dark:text-foreground-950">
        <div className="flex items-center justify-between">
          <span className="font-label text-[11px] uppercase tracking-widest opacity-70">{t('summary_payload')}</span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs underline whitespace-nowrap cursor-pointer">{open ? t('hide_payload') : t('show_payload')}</button>
        </div>
        {open && <pre className="mt-3 max-h-72 overflow-auto font-label text-[11px] leading-relaxed opacity-90">{JSON.stringify(safe, null, 2)}</pre>}
      </div>
    </aside>
  );
}