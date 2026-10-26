import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ApprovalChain from '@/pages/approvals/components/ApprovalChain';
import { RISK_STYLE, currentLevel, isUrgent, remainingLevels, type ApprovalItem } from '@/utils/approvals';
import { tx, localeOf } from '@/utils/catalog';

export default function ApprovalDetail({
  item, hasRequest, busy = false, onApprove, onReject,
}: {
  item: ApprovalItem;
  hasRequest: boolean;
  busy?: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  useEffect(() => {
    setRejectMode(false);
    setReason('');
    setReasonError('');
  }, [item.id]);

  const risk = RISK_STYLE[item.risk];
  const level = currentLevel(item);
  const pending = item.decision === 'pending';
  const canDecide = pending && item.myTurn;
  const urgent = isUrgent(item);

  const submitReject = () => {
    if (!reason.trim()) {
      setReasonError(t('appr_reject_reason_required'));
      return;
    }
    onReject(reason.trim());
    setRejectMode(false);
    setReason('');
  };

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <header className="p-4 md:p-5 border-b border-background-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-label text-xs text-foreground-500">{item.id}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[11px] ${risk.cls}`}>
            <i className={risk.icon} />{t(`appr_risk_${item.risk}`)}
          </span>
          <span className="font-label text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">{item.environment}</span>
          {pending && item.myTurn && (
            <span className="font-label text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-100 text-primary-800 dark:text-primary-900">{t('appr_my_turn')}</span>
          )}
          {urgent && (
            <span className="font-label text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-100 text-accent-900">{t('appr_sla_risk')}</span>
          )}
        </div>
        <h2 className="mt-1.5 font-heading text-xl md:text-2xl font-bold text-foreground-950">{tx(item.service, lang)}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-600">
          <span className="inline-flex items-center gap-1">
            <span className="w-6 h-6 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-label text-[10px]">{item.initials}</span>
            {item.user} · {tx(item.role, lang)}
          </span>
          <span>· {item.tenant}</span>
          <Link to={`/requests?q=${item.requestId}`} className="font-label text-primary-700 dark:text-primary-300 hover:underline cursor-pointer">{item.requestId}</Link>
        </div>

        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { k: t('appr_submitted'), v: new Date(item.submittedAt).toLocaleString(localeOf(lang), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { k: t('appr_due'), v: new Date(item.dueAt).toLocaleString(localeOf(lang), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { k: t('appr_levels'), v: `${item.levels.filter((l) => l.status !== 'skipped').length}` },
            { k: t('appr_remaining'), v: `${remainingLevels(item)}` },
          ].map((m) => (
            <div key={m.k} className="p-2.5 rounded-lg bg-background-100 border border-background-200 min-w-0">
              <dt className="font-label text-[10px] uppercase tracking-wider text-foreground-500 truncate">{m.k}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground-900 truncate">{m.v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 xl:divide-x divide-background-200">
        <div className="p-4 md:p-5 border-b xl:border-b-0 border-background-200">
          <h3 className="font-heading font-semibold text-foreground-950">{t('appr_chain')}</h3>
          <p className="mb-4 font-label text-[11px] text-foreground-500">{t('appr_chain_hint')}</p>
          <ApprovalChain levels={item.levels} decision={item.decision} approveLabel={t('appr_my_turn')} />
        </div>
        <div className="p-4 md:p-5 space-y-4">
          <div>
            <h3 className="font-heading font-semibold text-foreground-950">{t('appr_justification')}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground-700">{tx(item.justification, lang)}</p>
          </div>
          <div>
            <h3 className="font-heading font-semibold text-foreground-950">{t('appr_impacts')}</h3>
            <ul className="mt-2 space-y-1.5">
              {item.impacts.map((impact) => (
                <li key={impact.fr} className="flex items-start gap-2 text-sm text-foreground-700">
                  <span className="w-4 h-4 flex items-center justify-center text-accent-600 shrink-0 mt-0.5"><i className="ri-arrow-right-s-line" /></span>
                  {tx(impact, lang)}
                </li>
              ))}
            </ul>
          </div>
          {hasRequest && (
            <Link to={`/requests/${item.requestId}`} className="inline-flex items-center gap-1.5 text-sm text-primary-700 dark:text-primary-300 hover:underline cursor-pointer">
              <i className="ri-external-link-line" />{t('appr_view_request')}
            </Link>
          )}

          {!pending && (
            <div className={`flex items-start gap-3 p-3 rounded-lg border ${item.decision === 'approved' ? 'bg-primary-100 border-primary-300' : 'bg-accent-100 border-accent-300'}`}>
              <span className="w-7 h-7 rounded-lg bg-background-50 flex items-center justify-center shrink-0">
                <i className={item.decision === 'approved' ? 'ri-checkbox-circle-fill text-primary-700' : 'ri-close-circle-fill text-accent-700'} />
              </span>
              <p className="text-sm text-foreground-800">
                <strong className="text-foreground-950">{item.decision === 'approved' ? t('appr_decision_approved') : t('appr_decision_rejected')}</strong>
                {item.decidedAt ? ` · ${new Date(item.decidedAt).toLocaleString(localeOf(lang), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {pending && (
        <footer className="p-4 md:p-5 border-t border-background-200 bg-background-100">
          {!item.myTurn && level && (
            <p className="mb-3 flex items-center gap-2 text-xs text-foreground-600">
              <span className="w-5 h-5 flex items-center justify-center"><i className="ri-hourglass-line" /></span>
              {t('appr_waiting_for', { name: level.approver || t(levelLabelKeySafe(level.key)) })}
            </p>
          )}
          {rejectMode ? (
            <div className="space-y-2">
              <label htmlFor={`reject-${item.id}`} className="block text-sm font-medium text-foreground-900">{t('appr_reject_reason')}</label>
              <textarea
                id={`reject-${item.id}`}
                name="rejection_reason"
                value={reason}
                onChange={(e) => { setReason(e.target.value.slice(0, 500)); setReasonError(''); }}
                rows={3}
                placeholder={t('appr_reject_placeholder')}
                className="w-full box-border px-3 py-2 rounded-lg bg-background-50 border border-background-300 text-sm outline-none focus:ring-2 focus:ring-accent-400/40 resize-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-label text-[11px] text-foreground-500">{reason.length}/500</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setRejectMode(false); setReasonError(''); }} className="px-3 py-2 rounded-lg border border-background-300 text-sm whitespace-nowrap cursor-pointer hover:bg-background-200">
                    {t('appr_cancel')}
                  </button>
                  <button type="button" onClick={submitReject} disabled={busy} className="px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-700 text-background-50 text-sm font-semibold whitespace-nowrap cursor-pointer">
                    {t('appr_confirm_reject')}
                  </button>
                </div>
              </div>
              {reasonError && <p className="text-xs text-accent-700">{reasonError}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={() => setRejectMode(true)} disabled={!canDecide || busy}
                className="px-4 py-2 rounded-lg border border-accent-400 text-accent-700 text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-accent-100 disabled:opacity-40 disabled:cursor-not-allowed">
                <i className="ri-close-line mr-1" />{t('appr_reject')}
              </button>
              <button type="button" onClick={onApprove} disabled={!canDecide || busy}
                className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <i className="ri-check-line mr-1" />{t('appr_approve')}
              </button>
            </div>
          )}
        </footer>
      )}
    </section>
  );
}

const levelLabelKeySafe = (key: string) => `appr_level_${key}`;