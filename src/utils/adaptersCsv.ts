import type { AdapterItem } from '@/utils/store';

const csvCell = (value: string) => {
  const raw = value ?? '';
  return /[";\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export interface AdapterCsvLabels {
  name: string;
  kind: string;
  connectors: string;
  descFr: string;
  descEn: string;
}

/** Export CSV des adaptateurs avec le nombre de connecteurs qui les utilisent. */
export const adaptersToCsv = (
  adapters: AdapterItem[],
  countOf: (kind: string) => number,
  labels: AdapterCsvLabels,
) => {
  const lines = [
    [labels.name, labels.kind, labels.connectors, labels.descFr, labels.descEn],
    ...adapters.map((adapter) => [
      adapter.name,
      adapter.kind,
      String(countOf(adapter.kind)),
      adapter.description?.fr || '',
      adapter.description?.en || '',
    ]),
  ];
  return lines.map((row) => row.map(csvCell).join(';')).join('\r\n');
};

export const adaptersCsvFileName = () => `adaptateurs-${new Date().toISOString().slice(0, 10)}.csv`;