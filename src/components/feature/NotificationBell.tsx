import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildNotificationFeed, awxNotificationItems, loadReadIds, saveReadIds, type NotifItem } from '@/utils/notifications';
import {
  AWX_NOTIF_EVENT, loadAwxNotifications, type AwxNotif,
} from '@/utils/awxNotifications';
import { localeOf } from '@/utils/catalog';
import { useStore } from '@/utils/store';

const TONE_STYLE: Record<NotifItem['tone'], { wrap: string; icon: string }> = {
  success: { wrap: 'bg-primary-100 text-primary-700 dark:text-primary-900', icon: 'ri-checkbox-circle-fill' },
  error: { wrap: 'bg-accent-100 text-accent-800', icon: 'ri-close-circle-fill' },
  info: { wrap: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900', icon: 'ri-loader-4-line' },
  warning: { wrap: 'bg-accent-100 text-accent-900', icon: 'ri-error-warning-fill' },
};

type Filter = 'all' | 'execution' | 'approval';

export default function NotificationBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [readIds, setReadIds] = useState<string[]>(() => loadReadIds());
  const [awxNotifs, setAwxNotifs] = useState<AwxNotif[]>(() => loadAwxNotifications());
  const ref = useRef<HTMLDivElement>(null);
  const { requests, approvals } = useStore();

  const items = useMemo(() => {
    const base = buildNotificationFeed(i18n.language, (h) => t('notif_appr_due', { h }), requests, approvals);
    const merged = [...awxNotificationItems(awxNotifs, i18n.language), ...base]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return merged.slice(0, 18);
  }, [i18n.language, t, requests, approvals, awxNotifs]);

  useEffect(() => {
    const sync = () => setAwxNotifs(loadAwxNotifications());
    window.addEventListener(AWX_NOTIF_EVENT, sync);
    return () => window.removeEventListener(AWX_NOTIF_EVENT, sync);
  }, []);

  useEffect(() => {
    if (open) setAwxNotifs(loadAwxNotifications());
  }, [open]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const unread = items.filter((item) => !readIds.includes(item.id));
  const visible = items.filter((item) => (filter === 'all' ? true : item.kind === filter));

  const readAll = () => {
    const next = Array.from(new Set([...readIds, ...items.map((i) => i.id)]));
    setReadIds(next);
    saveReadIds(next);
  };

  const openItem = (item: NotifItem) => {
    const next = Array.from(new Set([...readIds, item.id]));
    setReadIds(next);
    saveReadIds(next);
    setOpen(false);
    navigate(item.href);
  };

  const timeOf = (iso: string) => new Date(iso).toLocaleString(localeOf(i18n.language), {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: t('notif_all'), count: items.length },
    { key: 'execution', label: t('notif_executions'), count: items.filter((i) => i.kind === 'execution').length },
    { key: 'approval', label: t('notif_approvals'), count: items.filter((i) => i.kind === 'approval').length },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('notif_aria')}
        aria-expanded={open}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-foreground-700 hover:bg-background-200 cursor-pointer"
      >
        <i className="ri-notification-3-line" />
        {unread.length > 0 && (
          <span className="absolute top-1 end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-500 text-foreground-950 font-label text-[9px] font-bold flex items-center justify-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-2 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl bg-background-50 border border-background-200 shadow-xl overflow-hidden">
          <div className="p-3 border-b border-background-200">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('notif_title')}</h2>
                <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
                  {t('notif_unread', { count: unread.length })}
                </p>
              </div>
              <button
                type="button"
                onClick={readAll}
                disabled={unread.length === 0}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap cursor-pointer hover:bg-primary-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="ri-check-double-line" />{t('notif_mark_all')}
              </button>
            </div>

            <div className="mt-2.5 flex items-center gap-1 p-1 rounded-full bg-background-200">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`flex-1 min-w-0 px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${filter === tab.key ? 'bg-background-50 text-foreground-950 shadow-sm' : 'text-foreground-600 hover:text-foreground-900'}`}
                >
                  {tab.label}
                  <span className="ms-1 font-label text-[9px] text-foreground-500">{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="max-h-[58vh] overflow-y-auto divide-y divide-background-200">
            {visible.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-foreground-500">{t('notif_empty')}</li>
            )}
            {visible.map((item) => {
              const tone = TONE_STYLE[item.tone];
              const isUnread = !readIds.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`w-full text-start px-3 py-2.5 flex items-start gap-2.5 cursor-pointer transition-colors ${isUnread ? 'bg-primary-500/5 hover:bg-primary-500/10' : 'hover:bg-background-100'}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone.wrap}`}>
                      <i className={`${tone.icon} text-sm`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-1.5">
                        <span className="block text-xs font-semibold text-foreground-950 truncate">{t(item.titleKey)}</span>
                        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0 mt-1" />}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-foreground-700 truncate">{item.service}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 font-label text-[9px] text-foreground-500 min-w-0">
                        <span className="shrink-0">{item.ref}</span>
                        {item.detail && <span className="truncate">· {item.detail}</span>}
                        <span className="ms-auto shrink-0">{timeOf(item.at)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="p-2 border-t border-background-200 bg-background-100 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/approvals'); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-200"
            >
              <i className="ri-checkbox-multiple-line" />{t('notif_view_approvals')}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold text-primary-700 dark:text-primary-300 whitespace-nowrap cursor-pointer hover:bg-primary-500/10"
            >
              <i className="ri-history-line" />{t('notif_view_history')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}