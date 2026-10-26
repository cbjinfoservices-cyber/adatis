import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildNotificationFeed, loadReadIds, saveReadIds, type NotifItem } from '@/utils/notifications';
import { localeOf } from '@/utils/catalog';
import { useStore } from '@/utils/store';

const TONE: Record<NotifItem['tone'], { wrap: string; icon: string }> = {
  success: { wrap: 'bg-primary-100 text-primary-700 dark:text-primary-900', icon: 'ri-checkbox-circle-fill' },
  error: { wrap: 'bg-accent-100 text-accent-800', icon: 'ri-close-circle-fill' },
  info: { wrap: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900', icon: 'ri-loader-4-line' },
  warning: { wrap: 'bg-accent-100 text-accent-900', icon: 'ri-error-warning-fill' },
};

type Filter = 'all' | 'execution' | 'approval';

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export default function NotificationHistory() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [readIds, setReadIds] = useState<string[]>(() => loadReadIds());
  const { requests, approvals } = useStore();

  const items = useMemo(
    () => buildNotificationFeed(lang, (h) => t('notif_appr_due', { h }), requests, approvals),
    [lang, t, requests, approvals],
  );

  const unreadIds = items.filter((item) => !readIds.includes(item.id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (!q) return true;
      return `${t(item.titleKey)} ${item.service} ${item.ref} ${item.detail || ''}`.toLowerCase().includes(q);
    });
  }, [items, filter, query, t]);

  const groups = useMemo(() => {
    const now = new Date();
    const todayKey = dayKey(now.toISOString());
    const yesterdayKey = dayKey(new Date(now.getTime() - 86400000).toISOString());
    const out: { key: string; label: string; items: NotifItem[] }[] = [];
    filtered.forEach((item) => {
      const key = dayKey(item.at);
      let group = out.find((g) => g.key === key);
      if (!group) {
        const label = key === todayKey
          ? t('notif_history_today')
          : key === yesterdayKey
            ? t('notif_history_yesterday')
            : new Date(item.at).toLocaleDateString(localeOf(lang), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        group = { key, label, items: [] };
        out.push(group);
      }
      group.items.push(item);
    });
    return out;
  }, [filtered, lang, t]);

  const readAll = () => {
    const next = Array.from(new Set([...readIds, ...items.map((i) => i.id)]));
    setReadIds(next);
    saveReadIds(next);
  };

  const openItem = (item: NotifItem) => {
    const next = Array.from(new Set([...readIds, item.id]));
    setReadIds(next);
    saveReadIds(next);
    navigate(item.href);
  };

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: t('notif_all'), count: items.length },
    { key: 'execution', label: t('notif_executions'), count: items.filter((i) => i.kind === 'execution').length },
    { key: 'approval', label: t('notif_approvals'), count: items.filter((i) => i.kind === 'approval').length },
  ];

  const kpis = [
    { label: t('notif_history_kpi_total'), value: items.length, icon: 'ri-notification-3-line' },
    { label: t('notif_history_kpi_unread'), value: unreadIds.length, icon: 'ri-mail-unread-line' },
    { label: t('notif_history_kpi_exec'), value: items.filter((i) => i.kind === 'execution').length, icon: 'ri-play-circle-line' },
    { label: t('notif_history_kpi_appr'), value: items.filter((i) => i.kind === 'approval').length, icon: 'ri-shield-check-line' },
  ];

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('notif_history_title')}</h1>
          <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('notif_history_subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={readAll}
          disabled={unreadIds.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <i className="ri-check-double-line" />{t('notif_mark_all')}
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="p-3.5 rounded-xl bg-background-50 border border-background-200 flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-background-200 text-foreground-700 flex items-center justify-center shrink-0">
              <i className={kpi.icon} />
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-xl font-bold text-foreground-950 leading-none">{kpi.value}</span>
              <span className="mt-1 block font-label text-[10px] uppercase tracking-widest text-foreground-500 truncate">{kpi.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="relative w-full lg:max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-foreground-500">
            <i className="ri-search-line" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('notif_history_search')}
            aria-label={t('notif_history_search')}
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-background-50 border border-background-200 text-sm outline-none focus:ring-2 focus:ring-primary-400/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('appr_cancel')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 cursor-pointer"
            >
              <i className="ri-close-line" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-background-200 overflow-x-auto max-w-full">
          {filters.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${filter === tab.key ? 'bg-background-50 text-foreground-950 shadow-sm' : 'text-foreground-600 hover:text-foreground-900'}`}
            >
              {tab.label}
              <span className="ms-1 font-label text-[10px] text-foreground-500">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl bg-background-50 border border-background-200 py-16 text-center text-foreground-500">
          <i className="ri-notification-off-line text-3xl" />
          <p className="mt-2 text-sm">{t('notif_history_empty')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <h2 className="font-heading text-sm font-semibold text-foreground-950">{group.label}</h2>
                <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-600">{group.items.length}</span>
              </div>
              <ul className="rounded-xl bg-background-50 border border-background-200 overflow-hidden divide-y divide-background-200">
                {group.items.map((item) => {
                  const tone = TONE[item.tone];
                  const isUnread = !readIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={`w-full text-start px-3.5 py-3 flex items-start gap-3 cursor-pointer transition-colors ${isUnread ? 'bg-primary-500/5 hover:bg-primary-500/10' : 'hover:bg-background-100'}`}
                      >
                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone.wrap}`}>
                          <i className={`${tone.icon} text-base`} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground-950">{t(item.titleKey)}</span>
                            <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-600 whitespace-nowrap">
                              {item.kind === 'approval' ? t('notif_approvals') : t('notif_executions')}
                            </span>
                            {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0" />}
                          </span>
                          <span className="mt-0.5 block text-xs text-foreground-700">{item.service}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-label text-[10px] text-foreground-500">
                            <span>{item.ref}</span>
                            {item.detail && <span>· {item.detail}</span>}
                            <span>· {timeOf(item.at)}</span>
                          </span>
                        </span>
                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-foreground-400 shrink-0">
                          <i className="ri-arrow-right-up-line" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}