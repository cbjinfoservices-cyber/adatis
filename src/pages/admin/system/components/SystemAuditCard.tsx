import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAuditLog, verifyAuditLog, type AuditEntry, type AuditVerification,
} from '@/utils/auth';
import { toCsv } from '@/utils/csv';
import { downloadCsv } from '@/utils/download';

const statusTone = (status: number) => {
  if (status >= 500) return 'bg-accent-100 text-accent-800';
  if (status >= 400) return 'bg-secondary-100 text-secondary-900';
  return 'bg-primary-500/10 text-primary-700 dark:text-primary-300';
};

/**
 * Journal d'audit (administrateurs) : toutes les écritures sur l'API et les
 * connexions, en ajout seul, chaînées par empreinte SHA-256. « Vérifier »
 * recalcule la chaîne côté serveur et signale la première entrée altérée.
 */
export default function SystemAuditCard() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchAuditLog(100));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const verify = async () => {
    setVerifying(true);
    try {
      setVerification(await verifyAuditLog());
    } catch {
      setVerification(null);
      setError(true);
    } finally {
      setVerifying(false);
    }
  };

  const stamp = (value: string) => new Date(value).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const exportCsv = () => {
    const header = [
      t('audit_log_col_at'), t('audit_log_col_actor'), t('auth_mapping_role'), t('auth_event_col_ip'),
      t('audit_log_col_action'), t('audit_log_col_target'), t('audit_log_col_status'),
    ];
    const rows = entries.map((entry) => [
      entry.at, entry.actorName, entry.actorRole, entry.ip, entry.action, entry.target, entry.status,
    ]);
    downloadCsv(`audit-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([header, ...rows]));
  };

  return (
    <section className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
      <header className="p-4 md:p-5 border-b border-background-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
            <i className="ri-shield-keyhole-line" />
          </span>
          <h2 className="font-heading text-sm font-semibold text-foreground-950">{t('audit_log_title')}</h2>
          <span className="font-label text-[10px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-600 whitespace-nowrap">
            {t('audit_log_count', { count: entries.length })}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void verify(); }}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className={verifying ? 'ri-loader-4-line animate-spin' : 'ri-fingerprint-line'} />
              {t('audit_log_verify')}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={entries.length === 0}
              title={t('audit_export')}
              aria-label={t('audit_export')}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-background-300 bg-background-50 text-foreground-700 cursor-pointer hover:bg-background-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="ri-download-2-line text-sm" />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-foreground-600">{t('audit_log_hint')}</p>
        {verification && (
          <p
            role="status"
            className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
              verification.ok ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'bg-accent-100 text-accent-800'
            }`}
          >
            <i className={verification.ok ? 'ri-checkbox-circle-line' : 'ri-alarm-warning-line'} />
            {verification.ok
              ? t('audit_log_verify_ok', { count: verification.count })
              : t('audit_log_verify_broken', { id: verification.brokenAt })}
          </p>
        )}
      </header>

      {loading ? (
        <div className="p-4 space-y-2">
          {[0, 1, 2, 3].map((row) => <div key={row} className="h-8 rounded-lg bg-background-100 animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="p-6 text-center text-sm text-foreground-600">{t('audit_log_error')}</p>
      ) : entries.length === 0 ? (
        <p className="p-6 text-center text-sm text-foreground-600">{t('audit_log_empty')}</p>
      ) : (
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-background-100 text-foreground-600">
                {['audit_log_col_at', 'audit_log_col_actor', 'audit_log_col_action', 'auth_event_col_ip', 'audit_log_col_status'].map((key) => (
                  <th key={key} scope="col" className="text-start font-label text-[10px] uppercase tracking-widest px-4 py-2 whitespace-nowrap">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-background-200 align-top">
                  <td className="px-4 py-2 text-xs text-foreground-700 whitespace-nowrap">{stamp(entry.at)}</td>
                  <td className="px-4 py-2 min-w-0">
                    <span className="block text-xs text-foreground-900 truncate max-w-[160px]">{entry.actorName || '—'}</span>
                    {entry.actorRole && <span className="block text-[10px] text-foreground-500">{entry.actorRole}</span>}
                  </td>
                  <td className="px-4 py-2 min-w-0">
                    <span dir="ltr" className="block font-label text-[11px] text-foreground-900 break-all">{entry.action}</span>
                    {entry.target && <span dir="ltr" className="block text-[10px] text-foreground-500 break-all">{entry.target}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span dir="ltr" className="font-label text-[11px] text-foreground-600">{entry.ip || '—'}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`font-label text-[10px] px-1.5 py-0.5 rounded ${statusTone(entry.status)}`}>{entry.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
