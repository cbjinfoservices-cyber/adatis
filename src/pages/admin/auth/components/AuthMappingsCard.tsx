import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ROLES, roleLabelKey, type PortalRole, type RoleMapping,
} from '@/utils/auth';

type Props = {
  mappings: RoleMapping[];
  suggestions: { organizations: string[]; teams: string[] };
  roleCounts: Partial<Record<PortalRole, number>>;
  loading: boolean;
  busy: boolean;
  readOnly?: boolean;
  onCreate: (body: { awxOrg: string; awxTeam: string; role: PortalRole; note: string }) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
};

const ROLE_STYLES: Record<PortalRole, string> = {
  admin: 'bg-primary-500/15 text-primary-700 dark:text-primary-300',
  approver: 'bg-accent-100 text-accent-900',
  requester: 'bg-secondary-100 text-secondary-900',
};

export default function AuthMappingsCard({
  mappings, suggestions, roleCounts, loading, busy, readOnly = false, onCreate, onDelete,
}: Props) {
  const { t } = useTranslation();
  const [awxOrg, setAwxOrg] = useState('');
  const [awxTeam, setAwxTeam] = useState('');
  const [role, setRole] = useState<PortalRole>('requester');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    if (!awxOrg.trim() && !awxTeam.trim()) {
      setFormError(t('auth_mapping_required'));
      return;
    }
    setFormError('');
    const ok = await onCreate({
      awxOrg: awxOrg.trim(),
      awxTeam: awxTeam.trim(),
      role,
      note: note.trim(),
    });
    if (ok) {
      setAwxOrg('');
      setAwxTeam('');
      setNote('');
      setRole('requester');
    }
  };

  const remove = async (id: number) => {
    if (readOnly) return;
    setDeleting(id);
    try {
      await onDelete(id);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="rounded-xl border border-background-200 bg-background-50 p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold text-foreground-950">{t('auth_mappings_title')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600 leading-relaxed">{t('auth_mappings_subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ROLES.map((value) => (
            <span key={value} className={`font-label text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${ROLE_STYLES[value]}`}>
              {t(roleLabelKey(value))} · {roleCounts[value] ?? 0}
            </span>
          ))}
        </div>
      </header>

      <form onSubmit={submit} className={`mt-4 rounded-lg border border-background-200 bg-background-100 p-3 ${readOnly ? 'opacity-60' : ''}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="min-w-0 block">
            <span className="block font-label text-[10px] uppercase tracking-widest text-foreground-500 mb-1">{t('auth_mapping_org')}</span>
            <input
              type="text"
              name="awx_org"
              value={awxOrg}
              onChange={(event) => setAwxOrg(event.target.value)}
              list="awx-org-options"
              placeholder={t('auth_mapping_all_orgs')}
              disabled={readOnly}
              className="w-full box-border px-2.5 py-1.5 rounded-md border border-background-300 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400"
            />
            <datalist id="awx-org-options">
              {suggestions.organizations.map((org) => <option key={org} value={org} />)}
            </datalist>
          </label>
          <label className="min-w-0 block">
            <span className="block font-label text-[10px] uppercase tracking-widest text-foreground-500 mb-1">{t('auth_mapping_team')}</span>
            <input
              type="text"
              name="awx_team"
              value={awxTeam}
              onChange={(event) => setAwxTeam(event.target.value)}
              list="awx-team-options"
              placeholder={t('auth_mapping_all_teams')}
              disabled={readOnly}
              className="w-full box-border px-2.5 py-1.5 rounded-md border border-background-300 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400"
            />
            <datalist id="awx-team-options">
              {suggestions.teams.map((team) => <option key={team} value={team} />)}
            </datalist>
          </label>
          <label className="min-w-0 block">
            <span className="block font-label text-[10px] uppercase tracking-widest text-foreground-500 mb-1">{t('auth_mapping_role')}</span>
            <select
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as PortalRole)}
              disabled={readOnly}
              className="w-full box-border px-2.5 py-1.5 rounded-md border border-background-300 bg-background-50 text-sm text-foreground-900 cursor-pointer disabled:cursor-not-allowed"
            >
              {ROLES.map((value) => (
                <option key={value} value={value}>{t(roleLabelKey(value))}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 block">
            <span className="block font-label text-[10px] uppercase tracking-widest text-foreground-500 mb-1">{t('auth_mapping_note')}</span>
            <input
              type="text"
              name="note"
              value={note}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('auth_mapping_note_placeholder')}
              disabled={readOnly}
              className="w-full box-border px-2.5 py-1.5 rounded-md border border-background-300 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400"
            />
          </label>
        </div>

        {formError && <p className="mt-2 text-xs text-accent-700">{formError}</p>}

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-foreground-500 leading-relaxed max-w-md">{t('auth_mapping_hint')}</p>
          <button
            type="submit"
            disabled={busy || readOnly}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            <i className={busy ? 'ri-loader-4-line animate-spin' : 'ri-add-line'} />
            {t('auth_mapping_add')}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((row) => <div key={row} className="h-10 rounded-lg bg-background-100 animate-pulse" />)}
        </div>
      ) : mappings.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-background-300 bg-background-100 px-3 py-6 text-center text-xs text-foreground-500">
          {t('auth_mapping_empty')}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-background-200 border border-background-200 rounded-lg overflow-hidden">
          {mappings.map((mapping) => (
            <li key={mapping.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-background-50 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                <span className="font-label text-[11px] px-2 py-0.5 rounded-md bg-secondary-100 text-secondary-900 truncate max-w-[180px]">
                  <i className="ri-building-2-line me-1" />
                  {mapping.awxOrg || t('auth_mapping_all_orgs')}
                </span>
                <span className="font-label text-[11px] px-2 py-0.5 rounded-md bg-background-200 text-foreground-800 truncate max-w-[180px]">
                  <i className="ri-team-line me-1" />
                  {mapping.awxTeam || t('auth_mapping_all_teams')}
                </span>
                <span className={`font-label text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${ROLE_STYLES[mapping.role]}`}>
                  {t(roleLabelKey(mapping.role))}
                </span>
                {mapping.note && (
                  <span className="text-[11px] text-foreground-500 truncate max-w-full">{mapping.note}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { void remove(mapping.id); }}
                disabled={deleting === mapping.id || readOnly}
                aria-label={t('auth_mapping_delete')}
                title={readOnly ? t('admin_readonly_action') : t('auth_mapping_delete')}
                className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-500 hover:bg-accent-50 hover:text-accent-700 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                <i className={deleting === mapping.id ? 'ri-loader-4-line animate-spin' : 'ri-delete-bin-line'} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}