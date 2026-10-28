import { useTranslation } from 'react-i18next';
import useReadOnly from '@/hooks/useReadOnly';
import type { Connector, ConnectorTestEntry } from '@/utils/connectors';
import { tx } from '@/utils/catalog';
import type { BatchTestEntry } from '@/utils/store';
import CatalogTable from '@/pages/admin/connectors/components/detail/CatalogTable';
import DetailHeader from '@/pages/admin/connectors/components/detail/DetailHeader';
import EndpointCard from '@/pages/admin/connectors/components/detail/EndpointCard';
import { BatchHistoryCard, ChangeHistoryCard, TestHistoryCard } from '@/pages/admin/connectors/components/detail/HistoryCards';
import NotesCard from '@/pages/admin/connectors/components/detail/NotesCard';
import RetestBanner from '@/pages/admin/connectors/components/detail/RetestBanner';
import useEndpointEditor from '@/pages/admin/connectors/components/detail/useEndpointEditor';

/**
 * Détail du connecteur sélectionné. La page le monte avec `key={connector.id}` :
 * les brouillons (nom, URL, notes) repartent de zéro à chaque changement de connecteur.
 */
export default function ConnectorDetail({
  connector, retestCount, testingAll, onTestAllRetest, batchHistory,
  onToggleMap, onUpdateEndpoint, onTest, onRename, onNotes, onDuplicate, onNotify, onDelete,
}: {
  connector: Connector;
  retestCount: number;
  batchHistory: BatchTestEntry[];
  testingAll: boolean;
  onTestAllRetest: () => void;
  onToggleMap: (itemId: string) => void;
  onUpdateEndpoint: (endpoint: string) => void;
  /** Test réel côté API (avec une nouvelle URL éventuelle) : renvoie l'entrée enregistrée. */
  onTest: (endpoint?: string) => Promise<ConnectorTestEntry | null>;
  onRename: (name: string) => void;
  onNotes: (notes: string) => void;
  onDuplicate: () => void;
  onNotify: (message: string) => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const readOnly = useReadOnly();
  const editor = useEndpointEditor(connector, { readOnly, onUpdateEndpoint, onTest, onNotify });

  const metrics = [
    { k: t('admin_auth'), v: connector.authMode },
    { k: t('admin_version'), v: connector.version },
    { k: t('admin_uptime'), v: connector.uptime ? `${connector.uptime}%` : '—' },
    { k: t('admin_latency'), v: connector.latencyMs ? `${connector.latencyMs} ms` : '—' },
  ];

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <DetailHeader
        connector={connector}
        readOnly={readOnly}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />

      {connector.retestRequiredAt && (
        <RetestBanner
          retestRequiredAt={connector.retestRequiredAt}
          retestCount={retestCount}
          testingAll={testingAll}
          readOnly={readOnly}
          editor={editor}
          onTestAllRetest={onTestAllRetest}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-background-200">
        <div className="p-4 md:p-5 space-y-4">
          <NotesCard connector={connector} readOnly={readOnly} onNotes={onNotes} onNotify={onNotify} />
          <EndpointCard connector={connector} editor={editor} />
          <TestHistoryCard connector={connector} onNotify={onNotify} />
          <ChangeHistoryCard connector={connector} />

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {metrics.map((m) => (
              <div key={m.k} className="min-w-0 p-2.5 rounded-lg bg-background-100 border border-background-200">
                <dt className="font-label text-[10px] uppercase tracking-wider text-foreground-500 truncate">{m.k}</dt>
                <dd className="mt-0.5 text-sm font-medium text-foreground-900 truncate">{m.v}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="font-heading font-semibold text-foreground-950">{t('admin_health_check')}</h3>
            <ul className="mt-2 space-y-1.5">
              {connector.checks.map((check) => (
                <li key={check.label.fr} className="flex items-center gap-2 text-sm">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${check.ok ? 'bg-primary-100 text-primary-700 dark:text-primary-300' : 'bg-accent-100 text-accent-700'}`}>
                    <i className={check.ok ? 'ri-check-line' : 'ri-close-line'} />
                  </span>
                  <span className="text-foreground-800">{tx(check.label, i18n.language)}</span>
                  <span className="ml-auto font-label text-[10px] text-foreground-500">
                    {check.ok ? t('admin_check_ok') : t('admin_check_ko')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-4 md:p-5">
          <h3 className="font-heading font-semibold text-foreground-950">{t('admin_capabilities')}</h3>
          <p className="mb-2 font-label text-[11px] text-foreground-500">{t('admin_capabilities_hint')}</p>
          <ul className="space-y-1.5">
            {connector.capabilities.map((cap) => (
              <li key={cap} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-background-100 border border-background-200">
                <span className="w-4 h-4 flex items-center justify-center text-primary-700 dark:text-primary-300 shrink-0 mt-0.5">
                  <i className="ri-arrow-right-line" />
                </span>
                <code className="font-label text-[11px] text-foreground-800 break-all" dir="ltr">{cap}</code>
              </li>
            ))}
          </ul>

          <BatchHistoryCard batchHistory={batchHistory} />
        </div>
      </div>

      <CatalogTable connector={connector} readOnly={readOnly} onToggleMap={onToggleMap} />
    </section>
  );
}
