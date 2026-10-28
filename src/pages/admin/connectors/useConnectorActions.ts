import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdapterOption } from '@/pages/admin/connectors/components/AddConnectorModal';
import type { ToastTone } from '@/hooks/useToast';
import { api, ApiError } from '@/utils/api';
import { reloadStore } from '@/utils/store';
import {
  configBundleFileName, configEntryMatches, configSelectionFileName, needsRetest, toConfigBundle,
  type Connector, type ConnectorConfigEntry, type ConnectorTestEntry, type ImportMatchStrategy,
} from '@/utils/connectors';
import { downloadJson } from '@/utils/download';

/** '—' est l'affichage d'une valeur absente : l'API attend une chaîne vide. */
const blankIfDash = (value: string) => (value === '—' ? '' : value);

/**
 * Appels API de la page Connecteurs. Chaque action recharge le store et
 * notifie le résultat ; l'état d'interface (sélection, modales) reste à la page,
 * qui se fie aux valeurs de retour (id créé, succès).
 */
export default function useConnectorActions(
  items: Connector[],
  notify: (message: string, tone?: ToastTone) => void,
) {
  const { t } = useTranslation();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  const notifyFailure = () => notify(t('data_error_title'), 'error');

  /**
   * Test réel exécuté par l'API (ping Ascender, joignabilité de l'URL pour les
   * autres). Avec `endpoint`, la nouvelle URL est d'abord enregistrée.
   */
  const runServerTest = async (connector: Connector, endpoint?: string): Promise<ConnectorTestEntry | null> => {
    try {
      if (endpoint && !connector.managed && endpoint !== connector.endpoint) {
        await api.patch(`/connectors/${connector.id}`, { endpoint });
      }
      const updated = await api.post<Connector>(`/connectors/${connector.id}/test`);
      await reloadStore();
      const entry = updated.tests[0] || null;
      if (entry?.ok) notify(t('admin_test_ok', { name: connector.name, ms: entry.latency }));
      else notify(t('admin_test_failed', { name: connector.name, error: entry?.error || '' }));
      return entry;
    } catch {
      notifyFailure();
      return null;
    }
  };

  const testConnector = async (connector: Connector) => {
    setTestingId(connector.id);
    try {
      await runServerTest(connector);
    } finally {
      setTestingId(null);
    }
  };

  /** Reteste les connecteurs marqués « à retester ». Vrai si tous ont réussi. */
  const testAllRetest = async () => {
    if (items.filter(needsRetest).length === 0) {
      notify(t('admin_retest_all_none'));
      return false;
    }
    setTestingAll(true);
    try {
      const summary = await api.post<{
        skipped?: boolean; total?: number; ok?: number; failed?: number;
      }>('/connectors/batch-test');
      await reloadStore();
      if (summary?.skipped) {
        notify(t('admin_retest_all_none'));
        return false;
      }
      notify(t('admin_retest_all_done', { ok: summary?.ok ?? 0, failed: summary?.failed ?? 0 }));
      return (summary?.failed ?? 0) === 0;
    } catch {
      notifyFailure();
      return false;
    } finally {
      setTestingAll(false);
    }
  };

  const syncConnector = async (connector: Connector) => {
    setSyncingId(connector.id);
    try {
      const updated = await api.post<Connector>(`/connectors/${connector.id}/sync`);
      await reloadStore();
      notify(t('admin_sync_ok', { name: connector.name, count: updated.catalog.length }));
    } catch (err) {
      const code = err instanceof ApiError ? (err.detail as { error?: string } | null)?.error : '';
      if (code === 'ascender_session_required') notify(t('admin_sync_session_required', { name: connector.name }));
      else if (code === 'ascender_unreachable') notify(t('admin_sync_unreachable', { name: connector.name }));
      else notifyFailure();
    } finally {
      setSyncingId(null);
    }
  };

  const syncAll = async () => {
    const eligible = items.filter((c) => c.health !== 'pending');
    if (eligible.length === 0) {
      notify(t('admin_sync_blocked', { name: items[0]?.name || '' }));
      return;
    }
    setSyncingAll(true);
    try {
      for (const connector of eligible) {
        // Ascender exige une session SSO : son échec ne bloque pas les autres.
        if (connector.managed) await api.post(`/connectors/${connector.id}/sync`).catch(() => null);
        else await api.post(`/connectors/${connector.id}/sync`);
      }
      await reloadStore();
      notify(t('admin_sync_all_ok', { count: eligible.length }));
    } catch {
      notifyFailure();
    } finally {
      setSyncingAll(false);
    }
  };

  /** Publie ou ignore un élément du catalogue importé. */
  const toggleMap = async (connector: Connector, itemId: string) => {
    const target = connector.catalog.find((item) => item.id === itemId);
    if (!target) return;
    try {
      await api.patch(`/connectors/${connector.id}/catalog/${itemId}`, {
        status: target.status === 'mapped' ? 'ignored' : 'mapped',
      });
      await reloadStore();
    } catch {
      notifyFailure();
    }
  };

  const patchConnector = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.patch(`/connectors/${id}`, body);
      await reloadStore();
      return true;
    } catch {
      notifyFailure();
      return false;
    }
  };

  const renameConnector = async (id: string, name: string) => {
    if (await patchConnector(id, { name })) notify(t('admin_rename_saved', { name }));
  };

  /** Crée un connecteur non configuré pour l'adaptateur. Renvoie son id. */
  const addAdapter = async (adapter: AdapterOption) => {
    try {
      const created = await api.post<Connector>('/connectors', {
        kind: adapter.kind,
        name: adapter.name,
        endpoint: '',
        notes: '',
        configured: false,
      });
      await reloadStore();
      notify(t('admin_added', { name: adapter.name }));
      return created.id;
    } catch {
      notifyFailure();
      return null;
    }
  };

  /** Copie non configurée d'un connecteur. Renvoie l'id de la copie. */
  const duplicateConnector = async (connector: Connector) => {
    try {
      const created = await api.post<Connector>('/connectors', {
        kind: connector.kind,
        name: t('admin_copy_suffix', { name: connector.name }),
        endpoint: blankIfDash(connector.endpoint),
        endpointDefault: blankIfDash(connector.endpointDefault),
        authMode: connector.authMode,
        version: connector.version,
        notes: connector.notes || '',
        scope: connector.scope,
        capabilities: connector.capabilities,
        configured: false,
      });
      await reloadStore();
      notify(t('admin_duplicate_done', { name: connector.name }));
      return created.id;
    } catch {
      notifyFailure();
      return null;
    }
  };

  /** Export JSON portable : tous les connecteurs, ou seulement la sélection filtrée. */
  const exportConfig = (list: Connector[], selection: boolean) => {
    if (list.length === 0) return;
    const file = selection ? configSelectionFileName() : configBundleFileName();
    downloadJson(file, JSON.stringify(toConfigBundle(list), null, 2));
    notify(selection
      ? t('admin_config_export_selection_done', { file, count: list.length })
      : t('admin_config_export_done', { file }));
  };

  /** Met à jour les connecteurs reconnus, crée les autres. Vrai en cas de succès. */
  const importConfig = async (entries: ConnectorConfigEntry[], strategy: ImportMatchStrategy = 'name') => {
    try {
      for (const entry of entries) {
        const match = configEntryMatches(items, entry, strategy);
        if (match) {
          await api.patch(`/connectors/${match.id}`, {
            name: entry.name, endpoint: entry.endpoint, notes: entry.notes,
          });
        } else {
          await api.post('/connectors', {
            kind: entry.kind,
            name: entry.name,
            endpoint: blankIfDash(entry.endpoint),
            endpointDefault: blankIfDash(entry.endpointDefault),
            authMode: entry.authMode,
            notes: entry.notes,
            scope: entry.scope,
            capabilities: entry.capabilities,
            configured: entry.configured,
          });
        }
      }
      await reloadStore();
      notify(t('admin_import_done', { count: entries.length }));
      return true;
    } catch {
      notifyFailure();
      return false;
    }
  };

  const deleteConnector = async (connector: Connector) => {
    try {
      await api.delete(`/connectors/${connector.id}`);
      await reloadStore();
      notify(t('admin_delete_done', { name: connector.name }));
      return true;
    } catch {
      notifyFailure();
      return false;
    }
  };

  return {
    testingId,
    syncingId,
    testingAll,
    syncingAll,
    runServerTest,
    testConnector,
    testAllRetest,
    syncConnector,
    syncAll,
    toggleMap,
    patchConnector,
    renameConnector,
    addAdapter,
    duplicateConnector,
    exportConfig,
    importConfig,
    deleteConnector,
  };
}
