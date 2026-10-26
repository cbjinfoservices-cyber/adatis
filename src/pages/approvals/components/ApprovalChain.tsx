import { useTranslation } from 'react-i18next';
import { LEVEL_STYLE, levelLabelKey, type ApprovalLevel, type Decision } from '@/utils/approvals';
import { tx, localeOf } from '@/utils/catalog';

export default function ApprovalChain({
  levels, decision, approveLabel,
}: {
  levels: ApprovalLevel[];
  decision: Decision;
  approveLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <ol className="relative space-y-4">
      <span className="absolute left-[15px] top-2 bottom-2 w-px bg-background-300" aria-hidden="true" />
      {levels.map((level, index) => {
        const st = LEVEL_STYLE[level.status];
        const isFinal = index === levels.length - 1;
        return (
          <li key={level.key} className="relative flex gap-3">
            <span className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${st.cls}`}>
              <i className={`${level.status === 'current' && decision === 'pending' ? 'ri-time-line' : st.icon} text-sm`} />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground-950">{t(levelLabelKey(level.key))}</span>
                <span className="font-label text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">
                  {t(`appr_level_status_${level.status}`)}
                </span>
                {level.status === 'current' && decision === 'pending' && (
                  <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-900">{approveLabel}</span>
                )}
              </div>
              <p className="mt-0.5 font-label text-[11px] text-foreground-500">
                {level.approver ? level.approver : t('appr_level_unassigned')}
                {level.decidedAt ? ` · ${new Date(level.decidedAt).toLocaleString(localeOf(lang), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
              {level.comment && (
                <p className="mt-1.5 text-xs text-foreground-700 bg-background-100 border border-background-200 rounded-lg px-2.5 py-1.5">
                  {tx(level.comment, lang)}
                </p>
              )}
              {level.status === 'current' && decision === 'pending' && !isFinal && (
                <p className="mt-1 font-label text-[11px] text-foreground-500">{t('appr_after_step')}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}