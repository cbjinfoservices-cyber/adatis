import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { tx } from '@/utils/catalog';
import type { FormField, FieldValue } from '@/types/catalog';

interface Props {
  field: FormField;
  value: FieldValue;
  error?: string;
  onChange: (v: FieldValue) => void;
}

const inputCls = (err?: string) => `w-full box-border px-3 py-2 rounded-lg bg-background-50 border text-sm text-foreground-950 outline-none transition-colors focus:ring-2 focus:ring-primary-400/40 ${err ? 'border-accent-600' : 'border-background-300 focus:border-primary-500'}`;

function TagsInput({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className={`${inputCls(error)} flex flex-wrap gap-1.5 items-center`}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-100 text-primary-800 dark:text-primary-900 font-label text-xs">
          {tag}
          <button type="button" aria-label="remove" onClick={() => onChange(value.filter((x) => x !== tag))} className="cursor-pointer"><i className="ri-close-line" /></button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} placeholder={t('tags_hint')} className="flex-1 min-w-[100px] bg-transparent outline-none text-sm" />
    </div>
  );
}

export default function FieldRenderer({ field, value, error, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const [mdPreview, setMdPreview] = useState(false);
  const lang = i18n.language;
  const id = `f-${field.name}`;
  const str = value === null || value === undefined ? '' : String(value);
  const arr = Array.isArray(value) ? value : [];
  const opts = field.options || [];

  switch (field.type) {
    case 'textarea':
    case 'json':
    case 'yaml':
      return (
        <textarea id={id} name={field.name} rows={field.type === 'textarea' ? 4 : 5} value={str} placeholder={field.placeholder} maxLength={500}
          onChange={(e) => onChange(e.target.value)} className={`${inputCls(error)} ${field.type !== 'textarea' ? 'font-label text-xs' : ''} resize-y`} />
      );
    case 'markdown':
      return (
        <div>
          <div className="flex gap-1 mb-1.5">
            {[false, true].map((p) => (
              <button key={String(p)} type="button" onClick={() => setMdPreview(p)} className={`px-2 py-0.5 rounded text-xs whitespace-nowrap cursor-pointer ${mdPreview === p ? 'bg-foreground-950 text-background-50' : 'text-foreground-600 hover:bg-background-200'}`}>
                {p ? t('preview') : t('edit')}
              </button>
            ))}
          </div>
          {mdPreview ? (
            <div className="min-h-[96px] px-3 py-2 rounded-lg bg-background-100 border border-background-200 text-sm whitespace-pre-wrap">
              {str.split('\n').map((line, i) => (
                <p key={i} className={line.startsWith('#') ? 'font-heading font-semibold' : ''}>{line.replace(/^#+\s?/, '').replace(/^- /, '• ')}</p>
              ))}
            </div>
          ) : (
            <textarea id={id} name={field.name} rows={4} value={str} maxLength={500} onChange={(e) => onChange(e.target.value)} className={inputCls(error)} />
          )}
        </div>
      );
    case 'checkbox':
      return (
        <label htmlFor={id} className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input id={id} name={field.name} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[oklch(var(--primary-500))] cursor-pointer" />
          {tx(field.label, lang)}
        </label>
      );
    case 'radio':
      return (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {opts.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={str === o.value} onClick={() => onChange(o.value)}
              className={`px-3 py-2 rounded-lg border text-sm whitespace-nowrap cursor-pointer transition-colors ${str === o.value ? 'border-primary-500 bg-primary-500/10 text-primary-800 dark:text-primary-300 font-medium' : 'border-background-300 bg-background-50 text-foreground-700 hover:border-foreground-400'}`}>
              {tx(o.label, lang)}
            </button>
          ))}
        </div>
      );
    case 'select':
      return (
        <select id={id} name={field.name} value={str} onChange={(e) => onChange(e.target.value)} className={`${inputCls(error)} cursor-pointer`}>
          <option value="">—</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{tx(o.label, lang)}</option>)}
        </select>
      );
    case 'multiselect':
      return (
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm whitespace-nowrap cursor-pointer ${on ? 'border-primary-500 bg-primary-500 text-background-50 dark:text-foreground-950' : 'border-background-300 text-foreground-700 hover:border-foreground-400'}`}>
                <i className={on ? 'ri-check-line' : 'ri-add-line'} />
                {tx(o.label, lang)}
              </button>
            );
          })}
        </div>
      );
    case 'autocomplete':
      return (
        <>
          <input id={id} name={field.name} list={`${id}-list`} value={str} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={inputCls(error)} autoComplete="off" />
          <datalist id={`${id}-list`}>
            {opts.map((o) => <option key={o.value} value={o.value}>{tx(o.label, lang)}</option>)}
          </datalist>
        </>
      );
    case 'tags':
      return <TagsInput value={arr} onChange={onChange} error={error} />;
    case 'file':
      return (
        <label htmlFor={id} className={`${inputCls(error)} flex items-center gap-3 cursor-pointer`}>
          <span className="px-2.5 py-1 rounded bg-background-200 text-xs font-medium whitespace-nowrap">{t('file_choose')}</span>
          <span className="text-foreground-500 truncate">{str || t('file_none')}</span>
          <input id={id} name={field.name} type="file" className="sr-only" onChange={(e) => onChange(e.target.files?.[0]?.name || '')} />
        </label>
      );
    default: {
      const typeMap: Record<string, string> = {
        password: 'password', email: 'email', url: 'url', number: 'number', integer: 'number', float: 'number', date: 'date', datetime: 'datetime-local',
      };
      const isNum = ['number', 'integer', 'float'].includes(field.type);
      return (
        <input id={id} name={field.name} type={typeMap[field.type] || 'text'} value={str} placeholder={field.placeholder}
          step={field.type === 'integer' ? 1 : field.type === 'float' ? 0.1 : undefined}
          min={field.validation?.min} max={field.validation?.max}
          onChange={(e) => onChange(isNum && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
          className={`${inputCls(error)} ${isNum || field.type === 'text' ? 'font-label' : ''}`} />
      );
    }
  }
}