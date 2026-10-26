import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SystemBucketStatus, SystemHistory } from '@/utils/system';

const barTone: Record<SystemBucketStatus, string> = {
  up: 'bg-primary-500',
  partial: 'bg-accent-400',
  down: 'bg-accent-600',
  unknown: 'bg-background-200 border border-background-300',
};

const latencyTone: Record<SystemBucketStatus, string> = {
  up: 'bg-primary-400',
  partial: 'bg-accent-400',
  down: 'bg-accent-600',
  unknown: 'bg-background-300',
};

const statusKey: Record<SystemBucketStatus, string> = {
  up: 'sys_avail_status_up',
  partial: 'sys_avail_status_partial',
  down: 'sys_avail_status_down',
  unknown: 'sys_avail_status_unknown',
};

const statusDot: Record<SystemBucketStatus, string> = {
  up: 'bg-primary-500',
  partial: 'bg-accent-400',
  down: 'bg-accent-600',
  unknown: 'bg-background-300',
};

const uptimeTone = (pct: number | null) => {
  if (pct === null) return 'text-foreground-600';
  if (pct >= 99.5) return 'text-primary-700 dark:text-primary-400';
  if (pct >= 95) return 'text-accent-700 dark:text-accent-500';
  return 'text-accent-800 dark:text-accent-500';
};

export default function SystemAvailability({ history }: { history: SystemHistory }) {
  const { t, i18n } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);

  const { buckets } = history;

  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const rangeLabel = useMemo(() => {
    if (buckets.length === 0) return '';
    const from = timeLabel(buckets[0].start);
    const to = timeLabel(new Date(history.buckets[history.buckets.length - 1].end).toISOString());
    return t('sys_avail_range', { from, to });
  }, [buckets, i18n.language, t]);

  const { maxLatency, latencySeries } = useMemo(() => {
    const values = buckets
      .map((bucket) => bucket.latencyMs)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const peak = values.length > 0 ? Math.max(...values) : 0;
    return {
      maxLatency: peak,
      latencySeries: buckets.map((bucket) => {
        if (bucket.latencyMs === null) return 0;
        if (peak <= 0) return 0;
        return Math.max(3, Math.round((bucket.latencyMs / peak) * 100));
      }),
    };
  }, [buckets]);

  const avgBottom = history.avgLatencyMs !== null && maxLatency > 0
    ? Math.min(100, Math.round((history.avgLatencyMs / maxLatency) * 100))
    : null;

  const active = hovered === null ? null : buckets[hovered];
  const uptime = history.uptimePct;

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 p-4 md:p-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="w-8 h-8 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
          <i className="ri-pulse-line" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('sys_avail_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">{t('sys_avail_hint', { hours: history.windowHours })}</p>
        </div>
        <div className="text-end shrink-0">
          <p className={`font-heading text-2xl font-bold leading-none tabular-nums ${uptimeTone(uptime)}`}>
            {uptime === null ? '—' : `${uptime.toFixed(1)} %`}
          </p>
          <p className="mt-1 font-label text-[10px] uppercase tracking-widest text-foreground-500">
            {t('sys_avail_uptime')}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-end gap-[2px] h-11" role="img" aria-label={t('sys_avail_title')}>
          {buckets.map((bucket, index) => (
            <button
              key={bucket.start}
              type="button"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              aria-label={`${timeLabel(bucket.start)} · ${t(statusKey[bucket.status])}`}
              title={`${timeLabel(bucket.start)} · ${t(statusKey[bucket.status])}${bucket.latencyMs === null ? '' : ` · ${bucket.latencyMs} ms`}`}
              className={`flex-1 min-w-[3px] h-full rounded-[2px] cursor-pointer transition-opacity ${barTone[bucket.status]} ${hovered === index ? 'opacity-100 ring-1 ring-foreground-900/30' : 'opacity-85 hover:opacity-100'}`}
            />
          ))}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap" dir="ltr">{rangeLabel}</span>
          <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
            {t('sys_avail_now')}
          </span>
        </div>

        <div className="mt-2.5 min-h-[34px] rounded-lg bg-background-100 border border-background-200 px-2.5 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {active ? (
            <>
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[active.status]}`} aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground-900">
                {t(statusKey[active.status])}
              </span>
              <span className="font-label text-[11px] text-foreground-500" dir="ltr">
                {timeLabel(active.start)} – {timeLabel(active.end)}
              </span>
              <span className="font-label text-[11px] text-foreground-500">
                {t('sys_avail_checks', { count: active.total })}
              </span>
              {active.latencyMs !== null && (
                <span className="font-label text-[11px] text-foreground-500" dir="ltr">
                  {active.latencyMs} ms
                </span>
              )}
            </>
          ) : (
            <>
              <span className="font-label text-[11px] text-foreground-500">
                {t('sys_avail_checks_total', { count: history.checks })}
              </span>
              {history.avgLatencyMs !== null && (
                <span className="font-label text-[11px] text-foreground-500">
                  {t('sys_avail_avg_latency', { value: history.avgLatencyMs })}
                </span>
              )}
              {history.downChecks > 0 && (
                <span className="font-label text-[11px] text-accent-800 dark:text-accent-500">
                  {t('sys_avail_down_checks', { count: history.downChecks })}
                </span>
              )}
              {history.checks === 0 && (
                <span className="font-label text-[11px] text-foreground-500">{t('sys_avail_no_data')}</span>
              )}
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {(['up', 'partial', 'down', 'unknown'] as SystemBucketStatus[]).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusDot[status]}`} aria-hidden="true" />
              <span className="font-label text-[10px] text-foreground-600">{t(statusKey[status])}</span>
            </span>
          ))}
          <span className="font-label text-[10px] text-foreground-400 ms-auto">
            {t('sys_avail_bucket', { minutes: history.bucketMinutes })}
          </span>
        </div>

        <div className="mt-4 rounded-lg border border-background-200 bg-background-100/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-label text-[10px] uppercase tracking-widest text-foreground-500">
              <i className="ri-line-chart-line" aria-hidden="true" />
              {t('sys_lat_title', { hours: history.windowHours })}
            </span>
            <span className="font-label text-[10px] text-foreground-500 tabular-nums" dir="ltr">
              {maxLatency > 0
                ? t('sys_lat_peak', { value: maxLatency })
                : t('sys_lat_no_data')}
            </span>
          </div>

          <div className="relative mt-2 h-20">
            {[25, 50, 75].map((position) => (
              <div
                key={position}
                aria-hidden="true"
                className="absolute left-0 right-0 border-t border-dashed border-background-300/70"
                style={{ bottom: `${position}%` }}
              />
            ))}

            {avgBottom !== null && (
              <div
                aria-hidden="true"
                className="absolute left-0 right-0 border-t border-primary-500/60"
                style={{ bottom: `${avgBottom}%` }}
              >
                <span className="absolute -top-4 right-0 font-label text-[9px] text-primary-700 dark:text-primary-400 bg-background-100 px-1">
                  {t('sys_lat_avg', { value: history.avgLatencyMs })}
                </span>
              </div>
            )}

            <div className="relative flex items-end gap-[2px] h-full" role="img" aria-label={t('sys_lat_title', { hours: history.windowHours })}>
              {buckets.map((bucket, index) => (
                <button
                  key={bucket.start}
                  type="button"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${timeLabel(bucket.start)} · ${bucket.latencyMs === null ? t('sys_lat_no_data') : `${bucket.latencyMs} ms`}`}
                  title={`${timeLabel(bucket.start)}${bucket.latencyMs === null ? '' : ` · ${bucket.latencyMs} ms`}`}
                  className="flex-1 min-w-[3px] h-full flex items-end cursor-pointer group"
                >
                  <span
                    className={`w-full rounded-t-[2px] transition-opacity ${latencyTone[bucket.status]} ${hovered === index ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}
                    style={{ height: `${Math.max(latencySeries[index], 2)}%` }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap" dir="ltr">{rangeLabel}</span>
            <span className="font-label text-[10px] text-foreground-500 whitespace-nowrap">
              {t('sys_lat_hint')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}