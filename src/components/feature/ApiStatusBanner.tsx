import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchSystemHealth } from '@/utils/system';
import { reloadStore, useStore } from '@/utils/store';

const RETRY_DELAY_SEC = 15;

/**
 * Bandeau global affiché sur toutes les pages du portail.
 * - API totalement injoignable : alerte rouge.
 * - Chargement partiel : avertissement discret.
 * Reconnexion automatique toutes les 15 s, plus un bouton manuel.
 */
export default function ApiStatusBanner() {
  const { t, i18n } = useTranslation();
  const { status, failedResources } = useStore();
  const [retrying, setRetrying] = useState(false);
  const [countdown, setCountdown] = useState(RETRY_DELAY_SEC);
  const [lastTry, setLastTry] = useState<string | null>(null);
  const busyRef = useRef(false);

  const offline = status === 'error';
  const partial = status === 'ready' && failedResources.length > 0;
  const visible = offline || partial;

  const attempt = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRetrying(true);
    try {
      await fetchSystemHealth();
      await reloadStore();
    } catch {
      /* API toujours indisponible : le minuteur reprendra */
    } finally {
      busyRef.current = false;
      setRetrying(false);
      setLastTry(new Date().toISOString());
      setCountdown(RETRY_DELAY_SEC);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    setCountdown(RETRY_DELAY_SEC);
    const ticker = window.setInterval(() => {
      setCountdown((value) => (value <= 1 ? RETRY_DELAY_SEC : value - 1));
    }, 1000);
    return () => window.clearInterval(ticker);
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = window.setInterval(() => {
      void attempt();
    }, RETRY_DELAY_SEC * 1000);
    return () => window.clearInterval(timer);
  }, [visible, attempt]);

  if (!visible) return null;

  const title = offline ? t('api_banner_down_title') : t('api_banner_partial_title');
  const hint = offline
    ? t('api_banner_down_hint', { seconds: countdown })
    : t('api_banner_partial_hint', { seconds: countdown });
  const tone = offline
    ? 'bg-accent-100 border-accent-300 text-accent-900'
    : 'bg-secondary-100 border-secondary-300 text-secondary-900';
  const icon = offline ? 'ri-cloud-off-line' : 'ri-error-warning-line';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-16 z-20 border-b px-4 md:px-6 py-2 ${tone}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="w-6 h-6 flex items-center justify-center shrink-0">
          <i className={`${icon} text-base`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="text-xs opacity-90 leading-snug">
            {hint}
            {lastTry && (
              <span className="opacity-75 hidden sm:inline">
                {' · '}
                {t('api_banner_last_try', {
                  time: new Date(lastTry).toLocaleTimeString(i18n.language, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                })}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void attempt(); }}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background-50 text-foreground-900 border border-background-300 text-xs font-semibold whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <i className={retrying ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
          {retrying ? t('api_banner_retrying') : t('api_banner_retry')}
        </button>
      </div>
    </div>
  );
}