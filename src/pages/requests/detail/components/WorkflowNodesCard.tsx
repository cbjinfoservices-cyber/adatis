import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AWX_STATUS_STYLE, formatDate } from '@/utils/executions';
import { fetchAwxWorkflowNodes, type AwxWorkflowNode } from '@/utils/awxAdmin';

type Props = {
  requestId: string;
  jobUrl: string;
  active: boolean;
  refreshKey: number;
};

const ACTIVE_NODE = ['new', 'pending', 'waiting', 'running'];

/** Étapes d'un workflow AWX : un nœud par étape, avec son statut réel. */
export default function WorkflowNodesCard({
  requestId, jobUrl, active, refreshKey,
}: Props) {
  const { t, i18n } = useTranslation();
  const [nodes, setNodes] = useState<AwxWorkflowNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const payload = await fetchAwxWorkflowNodes(requestId);
      setNodes(payload.nodes);
      setError(null);
    } catch {
      setError(t('awx_wf_error'));
    } finally {
      setLoading(false);
    }
  }, [requestId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setPulse((value) => value + 1), 10000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (pulse === 0) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  const done = nodes.filter((node) => !ACTIVE_NODE.includes(node.status.toLowerCase())).length;

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 p-4 md:p-5">
      <div className="flex flex-wrap items-start gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-secondary-100 text-secondary-800 dark:text-secondary-900 flex items-center justify-center shrink-0">
          <i className="ri-git-branch-line" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('awx_wf_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600">{t('awx_wf_hint')}</p>
        </div>
        {nodes.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background-200 font-label text-[10px] text-foreground-700 whitespace-nowrap">
            <i className="ri-list-check-2" aria-hidden="true" />
            {t('awx_wf_progress', { done, total: nodes.length })}
          </span>
        )}
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-background-300 text-[11px] font-semibold text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100"
          >
            <i className="ri-external-link-line" aria-hidden="true" />{t('awx_wf_open')}
          </a>
        )}
      </div>

      {loading && nodes.length === 0 ? (
        <p className="mt-3 font-label text-[11px] text-foreground-500">{t('awx_wf_loading')}</p>
      ) : error ? (
        <div className="mt-3 rounded-lg border border-accent-300 bg-accent-100 px-3 py-2.5">
          <p className="text-xs text-accent-900">{error}</p>
          <button
            type="button"
            onClick={() => { void load(); }}
            className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-accent-400 bg-background-50 text-[11px] font-semibold text-accent-900 whitespace-nowrap cursor-pointer hover:bg-background-100"
          >
            <i className="ri-refresh-line" aria-hidden="true" />{t('awx_wf_retry')}
          </button>
        </div>
      ) : nodes.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-background-300 bg-background-100 px-3 py-2.5 text-xs text-foreground-600">
          {t('awx_wf_empty')}
        </p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {nodes.map((node, index) => {
            const status = String(node.status || '').toLowerCase();
            const isRunning = status === 'running';
            const style = AWX_STATUS_STYLE[status] || 'bg-background-200 text-foreground-600';
            return (
              <li
                key={`${node.id}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-background-100 px-2.5 py-2"
              >
                <span className="w-5 h-5 rounded-md bg-background-200 text-foreground-600 flex items-center justify-center shrink-0 font-label text-[10px] tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground-900 truncate" title={node.name}>
                    {node.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-label text-[10px] text-foreground-500">
                    <span className="uppercase tracking-wider">{node.type}</span>
                    {node.jobId && <><span aria-hidden="true">·</span><span>#{node.jobId}</span></>}
                    {node.startedAt && <><span aria-hidden="true">·</span><span>{formatDate(node.startedAt, i18n.language)}</span></>}
                  </span>
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${style}`}>
                  <i className={isRunning ? 'ri-loader-4-line animate-spin' : 'ri-circle-fill text-[6px]'} aria-hidden="true" />
                  {t(`awx_status_${status}`, { defaultValue: status || t('awx_wf_pending') })}
                </span>
                {node.jobUrl && (
                  <a
                    href={node.jobUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={t('awx_wf_open')}
                    aria-label={t('awx_wf_open')}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                  >
                    <i className="ri-external-link-line text-xs" aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}