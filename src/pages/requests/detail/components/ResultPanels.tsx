import { useTranslation } from 'react-i18next';
import { tx } from '@/utils/catalog';
import { businessLabel } from '@/utils/executions';
import type { I18nText } from '@/types/catalog';

interface ResultProps { result: { type: string; status: string; fields: { label: I18nText; value: string }[] } }
interface ErrorProps { error: { code: string; severity: string; reason: I18nText; solution: I18nText } }

export function ResultCard({ result }: ResultProps) {
  const { t, i18n } = useTranslation();
  return (
    <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-primary-300">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center"><i className="ri-checkbox-circle-fill" /></span>
        <div>
          <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('exec_business_result')}</p>
          <h2 className="font-heading font-semibold text-foreground-950">{businessLabel(result.type, i18n.language.startsWith('en') ? 'en' : 'fr')}</h2>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {result.fields.map((f) => (
          <div key={f.value} className="p-2.5 rounded-lg bg-background-100 border border-background-200">
            <dt className="font-label text-[10px] uppercase tracking-wider text-foreground-500">{tx(f.label, i18n.language)}</dt>
            <dd className="text-sm font-medium text-foreground-950 break-all">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-label text-[10px] uppercase tracking-wider text-foreground-400">type: {result.type} · status: {result.status}</p>
    </section>
  );
}

export function ErrorCard({ error }: ErrorProps) {
  const { t, i18n } = useTranslation();
  return (
    <section className="p-4 md:p-5 rounded-xl bg-accent-50 border border-accent-300">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-lg bg-accent-500 text-foreground-950 flex items-center justify-center"><i className="ri-error-warning-fill" /></span>
        <div>
          <p className="font-label text-[10px] uppercase tracking-widest text-accent-800">{t('exec_error')}</p>
          <h2 className="font-heading font-semibold text-foreground-950">{tx(error.reason, i18n.language)}</h2>
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-background-50/70 border border-accent-200">
          <dt className="text-foreground-600">{t('exec_code')}</dt>
          <dd className="font-label font-semibold text-foreground-950">{error.code}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-background-50/70 border border-accent-200">
          <dt className="text-foreground-600">{t('exec_severity')}</dt>
          <dd className="font-label font-semibold text-accent-800 uppercase">{error.severity}</dd>
        </div>
        <div className="p-2.5 rounded-lg bg-background-50/70 border border-accent-200">
          <dt className="text-foreground-600">{t('exec_reason')}</dt>
          <dd className="text-foreground-950">{tx(error.reason, i18n.language)}</dd>
        </div>
        <div className="p-2.5 rounded-lg bg-background-50/70 border border-accent-200">
          <dt className="text-foreground-600">{t('exec_solution')}</dt>
          <dd className="text-foreground-950 flex items-start gap-1.5"><i className="ri-lightbulb-line text-accent-700 mt-0.5" />{tx(error.solution, i18n.language)}</dd>
        </div>
      </dl>
    </section>
  );
}