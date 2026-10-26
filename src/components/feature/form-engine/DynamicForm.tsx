import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import FieldRenderer from './FieldRenderer';
import { tx } from '@/utils/catalog';
import { validateField } from '@/utils/validation';
import type { UniversalFormSchema, FieldValue, FormField } from '@/types/catalog';

type Values = Record<string, FieldValue>;

const initialValues = (schema: UniversalFormSchema): Values => Object.fromEntries(
  schema.fields.map((f) => [f.name, f.default ?? (['tags', 'multiselect'].includes(f.type) ? [] : (f.type === 'checkbox' ? false : ''))]),
);

interface Props {
  schema: UniversalFormSchema;
  onValuesChange?: (v: Values) => void;
  onSubmit: (v: Values) => void;
}

export default function DynamicForm({ schema, onValuesChange, onSubmit }: Props) {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState<Values>(() => initialValues(schema));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSummaryError, setShowSummaryError] = useState(false);

  const sections = useMemo(() => {
    const map = new Map<string, FormField[]>();
    schema.fields.forEach((f) => {
      const key = tx(f.section, i18n.language);
      map.set(key, [...(map.get(key) || []), f]);
    });
    return [...map.entries()];
  }, [schema, i18n.language]);

  const errText = (f: FormField, v: FieldValue) => {
    const e = validateField(f, v);
    return e ? t(e.key, { v: e.v }) : '';
  };

  const update = (f: FormField, v: FieldValue) => {
    const next = { ...values, [f.name]: v };
    setValues(next);
    onValuesChange?.(next);
    if (errors[f.name] !== undefined) setErrors((p) => ({ ...p, [f.name]: errText(f, v) }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    schema.fields.forEach((f) => { next[f.name] = errText(f, values[f.name]); });
    setErrors(next);
    const hasErr = Object.values(next).some(Boolean);
    setShowSummaryError(hasErr);
    if (!hasErr) onSubmit(values);
  };

  const reset = () => {
    const v = initialValues(schema);
    setValues(v);
    setErrors({});
    setShowSummaryError(false);
    onValuesChange?.(v);
  };

  return (
    <form id={`form-${schema.id}`} onSubmit={handleSubmit} noValidate className="space-y-6">
      {sections.map(([title, fields]) => (
        <fieldset key={title || 'main'} className="p-4 md:p-6 rounded-xl bg-background-50 border border-background-200">
          {title && <legend className="px-2 font-label text-[11px] uppercase tracking-widest text-primary-700 dark:text-primary-300">{title}</legend>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            {fields.map((f) => {
              const wide = ['textarea', 'json', 'yaml', 'markdown', 'radio', 'multiselect', 'tags'].includes(f.type);
              return (
                <div key={f.name} className={`min-w-0 ${wide ? 'md:col-span-2' : ''}`}>
                  {f.type !== 'checkbox' && (
                    <label htmlFor={`f-${f.name}`} className="flex items-center gap-1 mb-1.5 text-sm font-medium text-foreground-900">
                      {tx(f.label, i18n.language)}
                      {f.required && <span className="text-accent-600" aria-hidden="true">*</span>}
                      <span className="ml-auto font-label text-[10px] text-foreground-400">{f.type}</span>
                    </label>
                  )}
                  <FieldRenderer field={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => update(f, v)} />
                  {errors[f.name] ? (
                    <p className="mt-1 text-xs text-accent-700 flex items-center gap-1" role="alert"><i className="ri-error-warning-line" />{errors[f.name]}</p>
                  ) : f.help && <p className="mt-1 text-xs text-foreground-500">{tx(f.help, i18n.language)}</p>}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      {showSummaryError && (
        <p className="px-4 py-3 rounded-lg bg-accent-50 border border-accent-300 text-sm text-accent-900 flex items-center gap-2" role="alert">
          <i className="ri-alert-line" />{t('form_errors')}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <button type="button" onClick={reset} className="px-5 py-2.5 rounded-lg border border-background-300 text-sm text-foreground-700 hover:bg-background-200 whitespace-nowrap cursor-pointer">{t('form_reset')}</button>
        <button type="submit" className="px-6 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-2">
          <i className="ri-send-plane-line" />{t('form_submit')}
        </button>
      </div>
    </form>
  );
}