import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteTemplateVisibility, saveTemplateVisibility,
  type AwxTemplateOption, type TemplateVisibilityRule,
} from '@/utils/awxAdmin';
import type { PortalRole } from '@/utils/auth';

type VisibilityRole = Exclude<PortalRole, 'admin'>;
type Props = {
  templates: AwxTemplateOption[];
  rules: TemplateVisibilityRule[];
  readOnly: boolean;
  onSaved: (rule: TemplateVisibilityRule) => void;
  onDeleted: (templateId: number) => void;
  onNotify: (message: string, tone?: 'info' | 'error') => void;
};

const ROLES: VisibilityRole[] = ['project_manager', 'approver', 'requester'];

type RowProps = {
  template: AwxTemplateOption;
  rule?: TemplateVisibilityRule;
  readOnly: boolean;
  onSaved: Props['onSaved'];
  onDeleted: Props['onDeleted'];
  onNotify: Props['onNotify'];
};

function TemplateVisibilityRow({
  template, rule, readOnly, onSaved, onDeleted, onNotify,
}: RowProps) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<VisibilityRole[]>(rule?.roles || []);
  const [hideAll, setHideAll] = useState(Boolean(rule && rule.roles.length === 0));
  const [saving, setSaving] = useState(false);
  const initialRoles = rule?.roles || [];
  const initialHideAll = Boolean(rule && rule.roles.length === 0);
  const dirty = hideAll !== initialHideAll
    || JSON.stringify([...roles].sort()) !== JSON.stringify([...initialRoles].sort());

  useEffect(() => {
    setRoles(rule?.roles || []);
    setHideAll(Boolean(rule && rule.roles.length === 0));
  }, [rule]);

  const toggleRole = (role: VisibilityRole, checked: boolean) => {
    setHideAll(false);
    setRoles((current) => (
      checked ? [...new Set([...current, role])] : current.filter((value) => value !== role)
    ));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveTemplateVisibility(template.id, {
        projectId: template.projectId!,
        roles: hideAll ? [] : roles,
      });
      onSaved(saved);
      onNotify(t('svc_visibility_saved'));
    } catch {
      onNotify(t('svc_visibility_error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteTemplateVisibility(template.id);
      onDeleted(template.id);
      setRoles([]);
      setHideAll(false);
      onNotify(t('svc_visibility_removed'));
    } catch {
      onNotify(t('svc_visibility_error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-col xl:flex-row xl:items-center gap-3 px-3 py-3 bg-background-50">
      <div className="min-w-0 xl:w-64 shrink-0">
        <p className="text-sm font-semibold text-foreground-900 truncate">{template.name}</p>
        <p className="font-label text-[10px] text-foreground-500">#{template.id}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 flex-1">
        <label className="inline-flex items-center gap-1.5 text-xs text-foreground-700">
          <input
            type="checkbox"
            checked={hideAll}
            onChange={(event) => {
              setHideAll(event.target.checked);
              if (event.target.checked) setRoles([]);
            }}
            disabled={readOnly || saving}
            className="accent-primary-600"
          />
          {t('svc_visibility_hide_all')}
        </label>
        {ROLES.map((role) => (
          <label key={role} className="inline-flex items-center gap-1.5 text-xs text-foreground-700">
            <input
              type="checkbox"
              checked={roles.includes(role)}
              onChange={(event) => toggleRole(role, event.target.checked)}
              disabled={readOnly || saving || hideAll}
              className="accent-primary-600"
            />
            {t(`auth_role_${role}`)}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {rule ? (
          <span className="font-label text-[10px] text-foreground-500">{t('svc_visibility_configured')}</span>
        ) : (
          <span className="font-label text-[10px] text-foreground-500">{t('svc_visibility_default')}</span>
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setRoles(initialRoles);
              setHideAll(initialHideAll);
            }}
            disabled={saving}
            className="px-2.5 py-1.5 rounded-lg border border-background-300 text-xs text-foreground-700 disabled:opacity-50"
          >
            {t('svc_admin_reset')}
          </button>
        )}
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={readOnly || saving || !dirty}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500 text-background-50 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-save-3-line'} aria-hidden="true" />
          {t('svc_admin_save')}
        </button>
        {rule && (
          <button
            type="button"
            onClick={() => { void remove(); }}
            disabled={readOnly || saving}
            title={t('svc_visibility_remove')}
            aria-label={`${t('svc_visibility_remove')} ${template.name}`}
            className="w-8 h-8 rounded-lg border border-background-300 text-foreground-600 hover:text-accent-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-delete-bin-line" aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export default function ProjectTemplateVisibility({
  templates, rules, readOnly, onSaved, onDeleted, onNotify,
}: Props) {
  const { t } = useTranslation();
  const grouped = new Map<number, { name: string; templates: AwxTemplateOption[] }>();
  templates.filter((template) => template.projectId).forEach((template) => {
    const projectId = template.projectId!;
    const project = grouped.get(projectId) || {
      name: template.projectName || `#${projectId}`,
      templates: [],
    };
    project.templates.push(template);
    grouped.set(projectId, project);
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading font-semibold text-foreground-950">{t('svc_visibility_title')}</h2>
        <p className="mt-1 text-xs text-foreground-600 max-w-3xl">{t('svc_visibility_hint')}</p>
      </div>
      {grouped.size === 0 ? (
        <p className="rounded-xl border border-dashed border-background-300 bg-background-50 p-5 text-sm text-foreground-600">
          {t('svc_visibility_empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {[...grouped.entries()].map(([projectId, project]) => (
            <section key={projectId} className="overflow-hidden rounded-xl border border-background-200">
              <h3 className="bg-background-100 px-3 py-2 text-sm font-semibold text-foreground-800">
                <i className="ri-folder-3-line me-1.5" aria-hidden="true" />
                {project.name}
              </h3>
              <ul className="divide-y divide-background-200">
                {project.templates.map((template) => (
                  <TemplateVisibilityRow
                    key={template.id}
                    template={template}
                    rule={rules.find((item) => item.templateId === template.id)}
                    readOnly={readOnly}
                    onSaved={onSaved}
                    onDeleted={onDeleted}
                    onNotify={onNotify}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
