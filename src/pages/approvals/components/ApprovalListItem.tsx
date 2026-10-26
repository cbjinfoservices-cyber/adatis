import { useTranslation } from 'react-i18next';
import { RISK_STYLE, isUrgent, type ApprovalItem } from '@/utils/approvals';
import { tx } from '@/utils/catalog';

const DOT: Record<string, string> = {
  approved: 'bg-primary-500',
  rejected: 'bg-accent-600',
  current: 'bg-secondary-500',
  waiting: 'bg-background-300',
  skipped: 'bg-background-300',
};

export default function ApprovalListItem({
  item, active, onSelect,
}: {
  item: ApprovalItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const risk = RISK_STYLE[item.risk];
  const urgent = isUrgent(item);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${active ? 'bg-background-50 border-primary-400 ring-1 ring-primary-400/40' : 'bg-background-50 border-background-200 hover:border-foreground-300'}`}
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-background-100 border border-background-200 flex items-center justify-center shrink-0 text-foreground-700">
          <i className="ri-file-list-3-line" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block text-sm font-semibold text-foreground-950 truncate">{tx(item.service, lang)}</span>
            {item.myTurn && item.decision === 'pending' && (
              <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" aria-hidden="true" />
            )}
          </span>
          <span className="mt-0.5 block font-label text-[11px] text-foreground-500 truncate">
            {item.id} · {item.user} · {item.tenant}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-label text-[10px] ${risk.cls}`}>
              <i className={risk.icon} />{t(`appr_risk_${item.risk}`)}
            </span>
            <span className="font-label text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">{item.environment}</span>
            {urgent && (
              <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-900">{t('appr_sla_risk')}</span>
            )}
            {item.decision !== 'pending' && (
              <span className={`font-label text-[10px] px-1.5 py-0.5 rounded ${item.decision === 'approved' ? 'bg-primary-100 text-primary-800 dark:text-primary-900' : 'bg-accent-100 text-accent-900'}`}>
                {item.decision === 'approved' ? t('appr_decision_approved') : t('appr_decision_rejected')}
              </span>
            )}
          </span>
          <span className="mt-2 flex items-center gap-1.5">
            {item.levels.map((l) => (
              <span key={l.key} className={`h-1.5 flex-1 rounded-full ${DOT[l.status]}`} title={t(`appr_level_${l.key}`)} />
            ))}
          </span>
        </span>
      </div>
    </button>
  );
}