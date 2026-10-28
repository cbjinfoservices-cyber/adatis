import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { endpointIsValid, type Connector, type ConnectorTestEntry } from '@/utils/connectors';

interface Options {
  readOnly: boolean;
  onUpdateEndpoint: (endpoint: string) => void;
  onTest: (endpoint?: string) => Promise<ConnectorTestEntry | null>;
  onNotify: (message: string) => void;
}

/**
 * Brouillon de l'URL d'un connecteur : saisie, validation, enregistrement,
 * retour à l'URL d'origine et test réel. Partagé par la carte URL et le
 * bandeau « à retester ».
 */
export default function useEndpointEditor(connector: Connector, { readOnly, onUpdateEndpoint, onTest, onNotify }: Options) {
  const { t } = useTranslation();
  const managed = Boolean(connector.managed);
  const [endpoint, setEndpoint] = useState(connector.endpoint);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Pick<ConnectorTestEntry, 'ok' | 'latency' | 'error'> | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const edit = (value: string) => {
    setEndpoint(value);
    setError(null);
    setTestResult(null);
  };

  const rejectInvalid = () => {
    setError(t('admin_endpoint_invalid'));
    setTestResult(null);
  };

  const save = () => {
    if (readOnly) return;
    const next = endpoint.trim();
    if (!endpointIsValid(next)) {
      rejectInvalid();
      return;
    }
    edit(next);
    onUpdateEndpoint(next);
    onNotify(t('admin_endpoint_saved', { name: connector.name }));
  };

  const reset = () => {
    if (readOnly) return;
    edit(connector.endpointDefault);
    setConfirmReset(false);
    onUpdateEndpoint(connector.endpointDefault);
    onNotify(t('admin_endpoint_reset_done', { name: connector.name }));
  };

  /** Le connecteur Ascender (géré par la configuration) se teste sans URL saisie. */
  const test = async () => {
    if (readOnly) return;
    const next = endpoint.trim();
    if (!managed && !endpointIsValid(next)) {
      rejectInvalid();
      return;
    }
    setError(null);
    setTesting(true);
    setTestResult(null);
    const entry = await onTest(managed ? undefined : next);
    setTesting(false);
    if (entry) setTestResult({ ok: entry.ok, latency: entry.latency, error: entry.error });
  };

  return {
    endpoint,
    dirty: endpoint.trim() !== connector.endpoint.trim(),
    error,
    testing,
    testResult,
    confirmReset,
    setConfirmReset,
    edit,
    save,
    reset,
    test,
  };
}

export type EndpointEditor = ReturnType<typeof useEndpointEditor>;
