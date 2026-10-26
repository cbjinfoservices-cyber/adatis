import { useTranslation } from 'react-i18next';
import { getActiveTenantId, renderEmailTemplate, resolveActiveBranding } from '@/utils/branding';
import { useStore } from '@/utils/store';

export default function SimulatedEmail({
  reference, serviceName,
}: {
  reference: string;
  serviceName: string;
}) {
  const { t } = useTranslation();
  const { tenants } = useStore();
  const brand = resolveActiveBranding(tenants, getActiveTenantId());

  const values = { ref: reference, service: serviceName, platform: brand.platformName };
  const customSubject = (brand.emailSubject || '').trim();
  const customBody = (brand.emailBody || '').trim();
  const subject = customSubject ? renderEmailTemplate(customSubject, values) : t('email_sim_subject', { ref: reference });
  const body = customBody ? renderEmailTemplate(customBody, values) : t('email_sim_body', { service: serviceName, ref: reference });

  return (
    <section className="mt-6 rounded-xl border border-background-200 bg-background-50 overflow-hidden text-start">
      <header className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-background-100 border-b border-background-200">
        <span className="w-5 h-5 flex items-center justify-center text-foreground-600 shrink-0">
          <i className="ri-mail-line" />
        </span>
        <p className="font-label text-[10px] uppercase tracking-widest text-foreground-600">
          {t('email_sim_title')}
        </p>
        <span className="ms-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary-100 text-secondary-800 dark:text-secondary-900 font-label text-[10px] whitespace-nowrap">
          <i className="ri-flask-line" />
          {t('email_sim_badge')}
        </span>
      </header>

      <div className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center shrink-0 overflow-hidden">
            {brand.logo
              ? <img src={brand.logo} alt={brand.platformName} className="w-full h-full object-contain" />
              : <i className="ri-flashlight-line" />}
          </span>
          <div className="min-w-0">
            <p className="font-heading font-bold text-foreground-950 truncate">{brand.platformName}</p>
            <p className="font-label text-[11px] text-foreground-500 truncate" dir="ltr">
              no-reply@{brand.domain}
            </p>
          </div>
          <span className="ms-auto font-label text-[10px] text-foreground-500 whitespace-nowrap">
            {t('email_sim_to')} · camille.laurent@{brand.domain}
          </span>
        </div>

        <p className="mt-4 font-heading font-semibold text-foreground-950 break-words">
          {subject}
        </p>
        {!customBody && <p className="mt-2 text-sm text-foreground-700">{t('email_sim_greeting')}</p>}
        <p className={`${customBody ? 'mt-2' : 'mt-1'} text-sm text-foreground-700 whitespace-pre-line break-words`}>
          {body}
        </p>

        <a
          href={brand.portalUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer"
        >
          {t('email_sim_cta')}
          <i className="ri-arrow-right-line" />
        </a>
        <p className="mt-2 font-label text-[11px] text-primary-700 dark:text-primary-300 break-all" dir="ltr">
          {brand.portalUrl}
        </p>

        <div className="mt-4 pt-3 border-t border-background-200">
          <p className="text-xs text-foreground-500">
            {t('email_sim_footer', { platform: brand.platformName })}
          </p>
          <p className="mt-1 font-label text-[10px] text-foreground-500">{t('email_sim_note')}</p>
        </div>
      </div>
    </section>
  );
}