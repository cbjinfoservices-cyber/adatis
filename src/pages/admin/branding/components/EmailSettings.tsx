import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EMAIL_TOKENS, renderEmailTemplate, type TenantBranding } from '@/utils/branding';

const SUBJECT_MAX = 120;
const BODY_MAX = 500;
const SAMPLE = { ref: 'DEM-2026-1042', service: 'Créer un serveur Linux' };

export default function EmailSettings({
  branding, readOnly = false, onChange, onNotify,
}: {
  branding: TenantBranding;
  readOnly?: boolean;
  onChange: (patch: Partial<TenantBranding>) => void;
  onNotify: (message: string) => void;
}) {
  const { t } = useTranslation();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);

  const subject = branding.emailSubject ?? '';
  const body = branding.emailBody ?? '';

  const insertToken = (field: 'subject' | 'body', token: string) => {
    const el = field === 'subject' ? subjectRef.current : bodyRef.current;
    const current = field === 'subject' ? subject : body;
    const max = field === 'subject' ? SUBJECT_MAX : BODY_MAX;
    if (!el) return;
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`.slice(0, max);
    if (field === 'subject') {
      onChange({ emailSubject: next });
    } else {
      onChange({ emailBody: next });
    }
    const caret = Math.min(start + token.length, max);
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const resetTemplate = () => {
    setError(null);
    onChange({ emailSubject: '', emailBody: '' });
    onNotify(t('brand_email_reset_done'));
  };

  const validate = () => {
    if (!subject.trim() || !body.trim()) {
      setError(t('brand_email_required'));
      return;
    }
    setError(null);
  };

  const previewSubject = renderEmailTemplate(subject, { ...SAMPLE, platform: branding.platformName });
  const previewBody = renderEmailTemplate(body, { ...SAMPLE, platform: branding.platformName });

  return (
    <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
      <header className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-foreground-950">{t('brand_email')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600 max-w-xl">{t('brand_email_hint')}</p>
        </div>
        <button
          type="button"
          onClick={resetTemplate}
          disabled={readOnly}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-background-300 bg-background-50 text-[11px] font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-arrow-go-back-line" />{t('brand_email_reset')}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
          {t('brand_email_tokens')}
        </span>
        {EMAIL_TOKENS.map((token) => (
          <code
            key={token}
            className="px-1.5 py-0.5 rounded-md bg-secondary-100 text-secondary-900 dark:text-secondary-800 font-label text-[10px]"
            dir="ltr"
          >
            {token}
          </code>
        ))}
      </div>

      <div className="space-y-3">
        <label className="block min-w-0">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
              {t('brand_email_subject')}
            </span>
            <span className="font-label text-[10px] text-foreground-500">
              {subject.length}/{SUBJECT_MAX}
            </span>
          </span>
          <input
            ref={subjectRef}
            type="text"
            value={subject}
            maxLength={SUBJECT_MAX}
            disabled={readOnly}
            placeholder={t('brand_email_subject_placeholder')}
            onChange={(e) => { onChange({ emailSubject: e.target.value }); setError(null); }}
            onBlur={validate}
            className="mt-1.5 w-full min-w-0 box-border px-3 py-2.5 rounded-lg border border-background-300 bg-background-100 text-sm text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => insertToken('subject', '{{ref}}')}
              disabled={readOnly}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 text-[10px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line" />{t('brand_email_insert_ref')}
            </button>
            <button
              type="button"
              onClick={() => insertToken('subject', '{{service}}')}
              disabled={readOnly}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 text-[10px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line" />{t('brand_email_insert_service')}
            </button>
          </span>
        </label>

        <label className="block min-w-0">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
              {t('brand_email_body')}
            </span>
            <span className="font-label text-[10px] text-foreground-500">
              {body.length}/{BODY_MAX}
            </span>
          </span>
          <textarea
            ref={bodyRef}
            rows={6}
            value={body}
            maxLength={BODY_MAX}
            disabled={readOnly}
            placeholder={t('brand_email_body_placeholder')}
            onChange={(e) => { onChange({ emailBody: e.target.value }); setError(null); }}
            onBlur={validate}
            className="mt-1.5 w-full min-w-0 box-border px-3 py-2.5 rounded-lg border border-background-300 bg-background-100 text-sm leading-relaxed text-foreground-950 resize-y focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => insertToken('body', '{{ref}}')}
              disabled={readOnly}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 text-[10px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line" />{t('brand_email_insert_ref')}
            </button>
            <button
              type="button"
              onClick={() => insertToken('body', '{{service}}')}
              disabled={readOnly}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 text-[10px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line" />{t('brand_email_insert_service')}
            </button>
            <button
              type="button"
              onClick={() => insertToken('body', '{{platform}}')}
              disabled={readOnly}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 text-[10px] font-medium text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line" />{t('brand_email_insert_platform')}
            </button>
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent-700">
          <i className="ri-error-warning-line" />{error}
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-background-200">
        <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
          {t('brand_email_preview')}
        </p>
        <div className="mt-2 rounded-lg border border-background-200 bg-background-100 p-3">
          <p className="font-heading font-semibold text-sm text-foreground-950 break-words">
            {previewSubject || t('brand_email_subject_placeholder')}
          </p>
          <p className="mt-1.5 text-xs text-foreground-700 whitespace-pre-line break-words">
            {previewBody || t('brand_email_body_placeholder')}
          </p>
        </div>
        <p className="mt-2 text-[11px] text-foreground-500 flex items-start gap-1.5">
          <i className="ri-information-line mt-0.5" />{t('brand_email_preview_hint')}
        </p>
      </div>
    </section>
  );
}