import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/feature/AppShell';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import ReadOnlyNotice from '@/components/base/ReadOnlyNotice';
import Toast from '@/components/base/Toast';
import AdminTabs from '@/pages/admin/components/AdminTabs';
import ConnectorCard from '@/pages/admin/connectors/components/ConnectorCard';
import ConnectorDetail from '@/pages/admin/connectors/components/ConnectorDetail';
import ConnectorKpis from '@/pages/admin/connectors/components/ConnectorKpis';
import ConnectorsHeader from '@/pages/admin/connectors/components/ConnectorsHeader';
import ConnectorsToolbar from '@/pages/admin/connectors/components/ConnectorsToolbar';
import { NoConnectors, NoMatchingConnectors } from '@/pages/admin/connectors/components/ConnectorsEmpty';
import AddConnectorModal, { type AdapterOption } from '@/pages/admin/connectors/components/AddConnectorModal';
import DeleteConnectorModal from '@/pages/admin/connectors/components/DeleteConnectorModal';
import ImportConnectorsModal from '@/pages/admin/connectors/components/ImportConnectorsModal';
import useConnectorActions from '@/pages/admin/connectors/useConnectorActions';
import useConnectorFilters from '@/pages/admin/connectors/useConnectorFilters';
import useReadOnly from '@/hooks/useReadOnly';
import useToast from '@/hooks/useToast';
import { loadStore, reloadStore, useStore } from '@/utils/store';
import {
  connectorTotals, type Connector, type ConnectorConfigEntry, type ImportMatchStrategy,
} from '@/utils/connectors';

export default function ConnectorsPage() {
  const readOnly = useReadOnly();
  const { connectors: items, adapters, batchTests, status, error, failedResources } = useStore();
  const { toast, notify, dismiss } = useToast();
  const filters = useConnectorFilters(items);
  const actions = useConnectorActions(items, notify);
  const { visibleItems, searchParams, updateParams } = filters;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Connector | null>(null);
  const autoTestRef = useRef(false);

  useEffect(() => {
    loadStore();
  }, []);

  const totals = useMemo(() => connectorTotals(items), [items]);
  const selected = items.find((c) => c.id === selectedId) || items[0] || null;
  const detailConnector = selected
    ? (visibleItems.some((c) => c.id === selected.id) ? selected : (visibleItems[0] || null))
    : null;

  useEffect(() => {
    if (visibleItems.length === 0) return;
    if (!visibleItems.some((c) => c.id === selectedId)) setSelectedId(visibleItems[0].id);
  }, [visibleItems, selectedId]);

  /** Une fois tous les connecteurs « à retester » validés, le filtre correspondant n'a plus d'objet. */
  const testAllRetest = async () => {
    const allOk = await actions.testAllRetest();
    if (allOk && filters.retestOnly) filters.setRetest(false);
  };

  // ?testall=1 (lien du tableau de bord) : lance le retest une seule fois, puis retire le paramètre.
  useEffect(() => {
    if (searchParams.get('testall') !== '1') {
      autoTestRef.current = false;
      return;
    }
    if (autoTestRef.current) return;
    autoTestRef.current = true;
    updateParams((params) => params.delete('testall'));
    testAllRetest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const addAdapter = async (adapter: AdapterOption) => {
    const id = await actions.addAdapter(adapter);
    if (!id) return;
    setSelectedId(id);
    setAddOpen(false);
  };

  const duplicateConnector = async (connector: Connector) => {
    const id = await actions.duplicateConnector(connector);
    if (id) setSelectedId(id);
  };

  const importConfig = async (entries: ConnectorConfigEntry[], strategy?: ImportMatchStrategy) => {
    if (!(await actions.importConfig(entries, strategy))) return;
    setImportOpen(false);
    filters.setSearch('');
    if (filters.healthFilter !== 'all' || filters.retestOnly) filters.resetFilters();
  };

  const deleteConnector = async (connector: Connector) => {
    if (!(await actions.deleteConnector(connector))) return;
    setPendingDelete(null);
    setSelectedId(null);
  };

  const failed = failedResources.includes('connectors');

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <ConnectorsHeader
          selectionCount={filters.filtersActive ? visibleItems.length : null}
          hasItems={items.length > 0}
          readOnly={readOnly}
          syncingAll={actions.syncingAll}
          onExportSelection={() => actions.exportConfig(visibleItems, true)}
          onExport={() => actions.exportConfig(items, false)}
          onImport={() => setImportOpen(true)}
          onSyncAll={actions.syncAll}
          onAdd={() => setAddOpen(true)}
        />

        <AdminTabs />

        <ReadOnlyNotice />

        <ConnectorKpis totals={totals} />

        {failed ? (
          <ErrorBlock message={error} onRetry={() => reloadStore()} />
        ) : status === 'loading' && items.length === 0 ? (
          <LoadingBlock />
        ) : (
          <>
            <div>
              <ConnectorsToolbar
                published={totals.published}
                catalog={totals.catalog}
                resultCount={visibleItems.length}
                search={filters.search}
                onSearch={filters.setSearch}
                healthFilter={filters.healthFilter}
                healthCounts={filters.healthCounts}
                onHealthFilter={filters.changeHealthFilter}
                retestOnly={filters.retestOnly}
                retestCount={filters.retestCount}
                onToggleRetest={() => filters.setRetest(!filters.retestOnly)}
                testingAll={actions.testingAll}
                onTestAllRetest={testAllRetest}
                sortBy={filters.sortBy}
                onSort={filters.setSortBy}
              />

              {items.length === 0 ? (
                <NoConnectors onAdd={() => setAddOpen(true)} />
              ) : visibleItems.length === 0 ? (
                <NoMatchingConnectors
                  search={filters.search}
                  retestOnly={filters.retestOnly}
                  onReset={filters.resetFilters}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4">
                  {visibleItems.map((connector) => (
                    <ConnectorCard
                      key={connector.id}
                      connector={connector}
                      active={selected?.id === connector.id}
                      testing={actions.testingId === connector.id}
                      syncing={actions.syncingId === connector.id}
                      onSelect={() => setSelectedId(connector.id)}
                      onTest={() => actions.testConnector(connector)}
                      onSync={() => actions.syncConnector(connector)}
                      onDuplicate={() => duplicateConnector(connector)}
                      onDelete={() => setPendingDelete(connector)}
                    />
                  ))}
                </div>
              )}
            </div>

            {detailConnector ? (
              <ConnectorDetail
                key={detailConnector.id}
                connector={detailConnector}
                retestCount={filters.retestCount}
                testingAll={actions.testingAll}
                batchHistory={batchTests}
                onTestAllRetest={testAllRetest}
                onToggleMap={(itemId) => actions.toggleMap(detailConnector, itemId)}
                onUpdateEndpoint={(endpoint) => void actions.patchConnector(detailConnector.id, { endpoint })}
                onTest={(endpoint) => actions.runServerTest(detailConnector, endpoint)}
                onRename={(name) => actions.renameConnector(detailConnector.id, name)}
                onNotes={(notes) => void actions.patchConnector(detailConnector.id, { notes })}
                onDuplicate={() => duplicateConnector(detailConnector)}
                onNotify={notify}
                onDelete={() => setPendingDelete(detailConnector)}
              />
            ) : (
              <NoConnectors />
            )}
          </>
        )}
      </div>

      <DeleteConnectorModal
        connector={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={deleteConnector}
      />

      <ImportConnectorsModal
        open={importOpen}
        existing={items}
        onClose={() => setImportOpen(false)}
        onImport={importConfig}
        onNotify={notify}
      />

      <AddConnectorModal
        open={addOpen}
        adapters={adapters as AdapterOption[]}
        connectedKinds={items.map((c) => c.kind)}
        onClose={() => setAddOpen(false)}
        onAdd={addAdapter}
      />

      <Toast toast={toast} onClose={dismiss} />
    </AppShell>
  );
}
