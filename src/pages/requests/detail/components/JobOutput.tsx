import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/utils/api';
import { fetchJobOutput } from '@/utils/awxJobs';

type Props = {
  requestId: string;
  /** Job à afficher (tentative ou nœud de workflow) ; null = job courant. */
  jobId: number | null;
  /** Workflow sans nœud choisi : rien à lire tant qu'une étape n'est pas sélectionnée. */
  needsNode: boolean;
  /** Job en cours : la sortie est relue toutes les 5 s. */
  active: boolean;
  refreshKey: number;
  onText?: (text: string) => void;
};

const POLL_MS = 5000;

/** Sortie réelle (stdout) d'un job Ascender, lue avec les droits de la personne connectée. */
export default function JobOutput({
  requestId, jobId, needsNode, active, refreshKey, onText,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [shownJob, setShownJob] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'forbidden' | 'failed' | null>(null);
  const boxRef = useRef<HTMLPreElement>(null);
  // Défilement automatique seulement si la personne lit déjà la fin.
  const follow = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (needsNode) return;
    if (!silent) setLoading(true);
    try {
      const output = await fetchJobOutput(requestId, jobId);
      setText(output.text);
      setShownJob(output.jobId);
      setTruncated(output.truncated);
      setError(null);
      onText?.(output.text);
    } catch (err) {
      if (!silent) setText('');
      setError(err instanceof ApiError && err.status === 403 ? 'forbidden' : 'failed');
    } finally {
      setLoading(false);
    }
  }, [requestId, jobId, needsNode, onText]);

  useEffect(() => {
    follow.current = true;
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!active || needsNode) return undefined;
    const timer = window.setInterval(() => { void load(true); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, needsNode, load]);

  useEffect(() => {
    const box = boxRef.current;
    if (box && follow.current) box.scrollTop = box.scrollHeight;
  }, [text]);

  const onScroll = () => {
    const box = boxRef.current;
    if (box) follow.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  };

  let body: string | null = null;
  if (needsNode) body = t('out_pick_node');
  else if (error === 'forbidden') body = t('out_forbidden');
  else if (error) body = t('out_error');
  else if (loading && !text) body = t('out_loading');
  else if (!text.trim()) body = t('out_empty');

  return (
    <section className="rounded-xl overflow-hidden border border-foreground-900 bg-foreground-950 text-background-50">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-background-50/10">
        <span className="w-5 h-5 flex items-center justify-center"><i className="ri-terminal-box-line text-primary-400" aria-hidden="true" /></span>
        <h2 className="font-label text-[11px] uppercase tracking-widest opacity-80">{t('out_title')}</h2>
        {shownJob && !needsNode && <span className="font-label text-[10px] opacity-60 tabular-nums">#{shownJob}</span>}
        <span className="ms-auto flex items-center gap-3">
          {active && !needsNode && (
            <span className="flex items-center gap-1.5 font-label text-[10px] uppercase tracking-wider text-primary-300">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" aria-hidden="true" />{t('exec_live')}
            </span>
          )}
          {!needsNode && (
            <button
              type="button"
              onClick={() => { void load(); }}
              title={t('sys_refresh')}
              aria-label={t('sys_refresh')}
              className="w-6 h-6 flex items-center justify-center rounded-md text-background-300 hover:text-background-50 hover:bg-background-50/10 cursor-pointer"
            >
              <i className={loading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {truncated && !body && (
        <p className="px-4 pt-2 font-label text-[10px] text-accent-300">{t('out_truncated')}</p>
      )}
      {body ? (
        <div className="px-4 py-3 text-xs opacity-80">
          <p>{body}</p>
          {error === 'failed' && (
            <button
              type="button"
              onClick={() => { void load(); }}
              className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-background-50/20 text-[11px] font-semibold cursor-pointer hover:bg-background-50/10"
            >
              <i className="ri-refresh-line" aria-hidden="true" />{t('awx_wf_retry')}
            </button>
          )}
        </div>
      ) : (
        <pre
          ref={boxRef}
          onScroll={onScroll}
          dir="ltr"
          className="max-h-96 overflow-auto px-4 py-3 font-label text-[11px] leading-relaxed whitespace-pre-wrap break-words"
        >
          {text}
        </pre>
      )}
    </section>
  );
}
