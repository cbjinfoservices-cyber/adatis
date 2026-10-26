import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditEntry } from '@/utils/approvals';
import { localeOf, tx } from '@/utils/catalog';

type Filter = 'all' | 'approved' | 'rejected';

const DECISION_STYLE: Record<'approved' | 'rejected', { cls: string; icon: string }> = {
  approved: { cls: 'bg-primary-100 text-primary-800 dark:text-primary-900', icon: 'ri-check-line' },
  rejected: { cls: 'bg-accent-100 text-accent-900', icon: 'ri-close-line' },
};

const initials = (name: string) => name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

export default function DecisionAuditLog({ entries }: { entries: AuditEntry[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && e.decision !== filter) return false;
      if (!q) return true;
      return [e.actor, e.ref, e.tenant, tx(e.service, lang), tx(e.comment, lang)]
        .join(' ').toLowerCase().includes(q);
    });
  }, [entries, filter, query, lang]);

  const counts = useMemo(() => ({
    all: entries.length,
    approved: entries.filter((e) => e.decision === 'approved').length,
    rejected: entries.filter((e) => e.decision === 'rejected').length,
  }), [entries]);

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(localeOf(lang), {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const exportCsv = () => {
    const header = ['timestamp', 'actor', 'role', 'decision', 'level', 'service', 'reference', 'tenant', 'comment'];
    const rows = filtered.map((e) => [
      e.at,
      e.actor,
      tx(e.actorRole, lang),
      e.decision,
      t(`appr_level_${e.level}`),
      tx(e.service, lang),
      e.ref,
      e.tenant,
      tx(e.comment, lang),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'audit-decisions.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('audit_filter_all') },
    { key: 'approved', label: t('audit_filter_approved') },
    { key: 'rejected', label: t('audit_filter_rejected') },
  ];

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <header className="p-4 md:p-5 border-b border-background-200 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading font-bold text-foreground-950">
            <span className="w-6 h-6 flex items-center justify-center text-primary-700 dark:text-primary-300"><i className="ri-history-line" /></span>
            {t('audit_title')}
          </h2>
          <p className="mt-1 text-xs text-foreground-600">{t('audit_subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div className="flex px-1 py-1 rounded-full bg-background-200">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap cursor-pointer transition-colors ${filter === f.key ? 'bg-background-50 text-foreground-950 shadow-sm font-semibold' : 'text-foreground-600 hover:text-foreground-900'}`}
              >
                {f.label}
                <span className="font-label text-[10px] opacity-70">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-background-300 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100"
          >
            <i className="ri-download-2-line" />{t('audit_export')}
          </button>
        </div>
      </header>

      <div className="px-4 md:px-5 py-3 border-b border-background-200 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute inset-y-0 left-3 flex items-center text-foreground-500"><i className="ri-search-line text-sm" /></span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('audit_search')}
            className="w-full box-border pl-9 pr-3 py-2 text-sm rounded-lg bg-background-100 border border-background-200 outline-none focus:ring-2 focus:ring-primary-400/40"
          />
        </div>
        <span className="font-label text-[11px] text-foreground-500">
          {filtered.length} {t('audit_count')} · {t('audit_note')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-foreground-600">{t('audit_empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left font-label text-[10px] uppercase tracking-wider text-foreground-500 bg-background-100">
                <th className="px-4 py-2.5 font-normal">{t('audit_col_time')}</th>
                <th className="px-4 py-2.5 font-normal">{t('audit_col_actor')}</th>
                <th className="px-4 py-2.5 font-normal">{t('audit_col_decision')}</th>
                <th className="px-4 py-2.5 font-normal">{t('audit_col_level')}</th>
                <th className="px-4 py-2.5 font-normal">{t('audit_col_service')}</th>
                <th className="px-4 py-2.5 font-normal">{t('audit_col_ref')}</th>
                <th className="px-4 py-2.5 font-normal">{t('audit_col_comment')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              {filtered.map((e) => {
                const style = DECISION_STYLE[e.decision];
                return (
                  <tr key={e.id} className="align-top hover:bg-background-100">
                    <td className="px-4 py-3 font-label text-[11px] text-foreground-600 whitespace-nowrap">{formatDate(e.at)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-secondary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center font-label text-[10px] shrink-0">
                          {initials(e.actor)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground-950 truncate">{e.actor}</span>
                          <span className="block font-label text-[10px] text-foreground-500 truncate">{tx(e.actorRole, lang)}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] uppercase tracking-wide whitespace-nowrap ${style.cls}`}>
                        <i className={style.icon} />
                        {e.decision === 'approved' ? t('appr_decision_approved') : t('appr_decision_rejected')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground-700 whitespace-nowrap">{t(`appr_level_${e.level}`)}</td>
                    <td className="px-4 py-3">
                      <span className="block text-xs font-medium text-foreground-900">{tx(e.service, lang)}</span>
                      <span className="block font-label text-[10px] text-foreground-500">{e.tenant}</span>
                    </td>
                    <td className="px-4 py-3 font-label text-[11px] text-primary-700 dark:text-primary-300 whitespace-nowrap">{e.ref}</td>
                    <td className="px-4 py-3 text-xs text-foreground-600 max-w-[260px]">
                      {e.comment ? tx(e.comment, lang) : <span className="text-foreground-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}