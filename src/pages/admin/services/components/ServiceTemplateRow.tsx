import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tx } from '@/utils/catalog';
import {
  saveServiceTemplate, templateOptionsOf,
  type AdminServiceItem, type AwxTemplateCatalog, type AwxTemplateKind,
} from '@/utils/awxAdmin';

type Props = {
  service: AdminServiceItem;
  catalog: AwxTemplateCatalog | null;
  readOnly: boolean;
  onSaved: (service: AdminServiceItem) => void;
  onNotify: (message: string, tone?: 'info' | 'error') => void;
};

const KINDS: { key: AwxTemplateKind; icon: string }[] = [
  { key: 'none', icon: 'ri-forbid-line' },
  { key: 'job', icon: 'ri-play-circle-line' },
  { key: 'workflow', icon: 'ri-git-branch-line' },
];

export default function ServiceTemplateRow({
  service, catalog, readOnly, onSaved, onNotify,
}: Props) {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<AwxTemplateKind>(service.kind);
  const [templateId, setTemplateId] = useState<number | null>(service.templateId);
  const [saving, setSaving] = useState(false);

  const options = templateOptionsOf(catalog, kind);
  const dirty = kind !== service.kind || (kind !== 'none' && templateId !== service.templateId);
  const missing = kind !== 'none' && !templateId;
  const blocked = readOnly;
  const templatesReadable = Boolean(catalog?.available);

  const changeKind = (next: AwxTemplateKind) => {
    setKind(next);
    if (next === 'none') setTemplateId(null);
    else {
      const list = templateOptionsOf(catalog, next);
      setTemplateId(
        next === service.kind && list.some((option) => option.id === service.templateId)
          ? service.templateId
          : null,
      );
    }
  };

  const save = async () => {
    if (missing) {
      onNotify(t('svc_admin_required'), 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await saveServiceTemplate(service.id, {
        kind,
        templateId: kind === 'none' ? null : templateId,
      });
      onSaved(updated);
      onNotify(t('svc_admin_saved', { name: tx(service.name, i18n.language) }));
    } catch {
      onNotify(t('svc_admin_error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="p-4 rounded-xl bg-background-50 border border-background-200">
      <div className="flex flex-col lg:flex-row lg:items-start gap-3">
        <div className="flex items-start gap-3 min-w-0 lg:w-[300px] shrink-0">
          <span className="w-9 h-9 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
            <i className={service.icon || 'ri-tools-line'} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-semibold text-foreground-950 truncate">
              {tx(service.name, i18n.language)}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-label text-[10px] uppercase tracking-wider text-foreground-500">
              <span>{service.id}</span>
              <span aria-hidden="true">·</span>
              <span className="normal-case tracking-normal">{t(`cat_${service.category}`)}</span>
              <span aria-hidden="true">·</span>
              <span className="normal-case tracking-normal">{t(`approval_${service.approval}`)}</span>
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div
            role="group"
            aria-label={t('svc_admin_kind_label')}
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-background-200 border border-background-300"
          >
            {KINDS.map((item) => {
              const active = kind === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => changeKind(item.key)}
                  disabled={blocked}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${active ? 'bg-background-50 text-foreground-950 font-semibold shadow-sm' : 'text-foreground-600 hover:text-foreground-900'}`}
                >
                  <span className="w-4 h-4 flex items-center justify-center"><i className={item.icon} /></span>
                  {t(`svc_admin_kind_${item.key}`)}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
            <div className="min-w-0">
              {kind === 'none' ? (
                <p className="px-3 py-2 rounded-lg bg-background-100 border border-dashed border-background-300 text-xs text-foreground-600">
                  {t('svc_admin_none_hint')}
                </p>
              ) : options.length === 0 ? (
                <p className="px-3 py-2 rounded-lg bg-background-100 border border-dashed border-background-300 text-xs text-foreground-600">
                  {catalog?.available ? t('svc_admin_no_templates') : t('svc_admin_unavailable')}
                </p>
              ) : (
                <select
                  value={templateId ? String(templateId) : ''}
                  onChange={(event) => setTemplateId(event.target.value ? Number(event.target.value) : null)}
                  disabled={readOnly || !templatesReadable}
                  aria-label={t('svc_admin_pick')}
                  className="w-full box-border min-w-0 px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-sm text-foreground-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400/40 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">{t('svc_admin_pick')}</option>
                  {options.map((option) => (
                    <option key={`${option.kind}-${option.id}`} value={option.id}>
                      {option.name}{option.organization ? ` · ${option.organization}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {kind !== 'none' && templateId && (
                <p className="mt-1 font-label text-[10px] text-foreground-500">
                  {t('svc_admin_current')} : #{templateId}
                  {service.templateName && kind === service.kind ? ` · ${service.templateName}` : ''}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  onClick={() => { setKind(service.kind); setTemplateId(service.templateId); }}
                  className="px-3 py-2 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100"
                >
                  {t('svc_admin_reset')}
                </button>
              )}
              <button
                type="button"
                onClick={() => { void save(); }}
                disabled={readOnly || saving || !dirty || (kind !== 'none' && !templatesReadable)}
                title={readOnly ? t('admin_readonly_action') : t('svc_admin_save')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-save-3-line'} aria-hidden="true" />
                {saving ? t('svc_admin_saving') : t('svc_admin_save')}
              </button>
            </div>
          </div>

          {dirty && <p className="font-label text-[10px] text-accent-700">{t('svc_admin_unsaved')}</p>}
        </div>
      </div>
    </li>
  );
}