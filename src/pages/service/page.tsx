import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import DynamicForm from '@/components/feature/form-engine/DynamicForm';
import SimulatedEmail from '@/components/feature/SimulatedEmail';
import RequestSummary from '@/pages/service/components/RequestSummary';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import { api, ApiError } from '@/utils/api';
import { tx } from '@/utils/catalog';
import { loadStore, projectIconOf, useStore } from '@/utils/store';
import type { FieldValue, ServiceItem, UniversalFormSchema } from '@/types/catalog';
import type { AwxLaunchResult, RequestItem } from '@/utils/executions';

type ServicePayload = ServiceItem & { form: UniversalFormSchema | null };

export default function ServicePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { projects } = useStore();
  const [service, setService] = useState<ServicePayload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [reference, setReference] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [launch, setLaunch] = useState<AwxLaunchResult | null>(null);

  useEffect(() => {
    loadStore();
    let active = true;
    setState('loading');
    api
      .get<ServicePayload>(`/services/${id}`)
      .then((data) => {
        if (!active) return;
        setService(data);
        setState(data.form ? 'ready' : 'error');
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [id]);

  const submit = async (v: Record<string, FieldValue>) => {
    if (!service) return;
    setValues(v);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const environment = typeof v.environment === 'string' ? v.environment : 'dev';
      const created = await api.post<RequestItem & { awxLaunch?: AwxLaunchResult }>('/requests', {
        serviceId: service.id,
        environment,
        userId: 'u-camille',
        tenantId: 'acme',
        payload: v,
      });
      setLaunch(created.awxLaunch ?? null);
      setReference(created.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const detail = err instanceof ApiError
        ? (err.detail as { error?: string; fields?: { field: string }[] } | null)
        : null;
      if (detail?.error === 'invalid_payload') {
        setSubmitError(t('request_invalid_payload', { fields: (detail.fields || []).map((f) => f.field).join(', ') }));
      } else if (detail?.error === 'service_forbidden') {
        setSubmitError(t('request_service_forbidden'));
      } else {
        setSubmitError(t('request_submit_error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const backLink = (
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-foreground-600 hover:text-primary-600 cursor-pointer">
      <i className="ri-arrow-left-line" />{t('back_catalog')}
    </Link>
  );

  if (state === 'loading') {
    return <AppShell><div className="px-4 md:px-10 py-8">{backLink}<LoadingBlock /></div></AppShell>;
  }

  if (state === 'error' || !service || !service.form) {
    return (
      <AppShell>
        <div className="px-4 md:px-10 py-8">
          {backLink}
          <div className="mt-6">
            <ErrorBlock onRetry={() => window.location.reload()} />
          </div>
          <Link to="/" className="mt-4 inline-block text-primary-600 underline cursor-pointer">{t('back_catalog')}</Link>
        </div>
      </AppShell>
    );
  }

  const schema = service.form;
  const project = projects.find((p) => p.id === service.project);

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8">
        {backLink}
        <header className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-primary-500 text-background-50 dark:text-foreground-950 flex items-center justify-center">
            <i className={`${service.icon} text-2xl md:text-3xl`} />
          </span>
          <div className="min-w-0">
            <p className="font-label text-[11px] uppercase tracking-widest text-foreground-500 flex items-center gap-1.5">
              <i className={project?.icon || 'ri-folder-line'} />
              {t('catalog_project')} · {t(`proj_${service.project}`)} · {t(`cat_${service.category}`)}
            </p>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{tx(service.name, i18n.language)}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{tx(service.description, i18n.language)}</p>
          </div>
        </header>

        <div className="mt-8 flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 w-full">
            {reference ? (
              <>
                <div className="asp-rise p-6 md:p-10 rounded-xl bg-background-50 border border-primary-300 text-center">
                  <span className="mx-auto w-14 h-14 rounded-full bg-primary-100 text-primary-700 dark:text-primary-900 flex items-center justify-center">
                    <i className="ri-check-double-line text-2xl" />
                  </span>
                  <h2 className="mt-4 font-heading text-xl font-bold text-foreground-950">{t('success_title')}</h2>
                  <p className="mt-2 text-sm text-foreground-600 max-w-md mx-auto">{t('success_text')}</p>
                  <p className="mt-4 font-label text-sm">
                    {t('success_ref')} : <strong className="text-primary-700 dark:text-primary-300">{reference}</strong>
                  </p>
                  {launch?.jobId && (
                    <div className="mt-4 mx-auto max-w-md rounded-lg border border-primary-300 bg-primary-500/5 p-3 text-start">
                      <p className="text-xs font-semibold text-foreground-950 flex items-center gap-1.5">
                        <i className="ri-play-circle-line text-primary-700 dark:text-primary-300" />
                        {t('awx_job_launched_title', { id: launch.jobId })}
                      </p>
                      <p className="mt-1 text-[11px] text-foreground-600">{t('awx_job_launched_hint')}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {launch.jobUrl && (
                          <a href={launch.jobUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-xs font-semibold whitespace-nowrap cursor-pointer">
                            <i className="ri-external-link-line" />{t('awx_job_open')}
                          </a>
                        )}
                        <Link to={`/requests/${reference}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-background-300 bg-background-50 text-xs font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100">
                          <i className="ri-eye-line" />{t('view_details')}
                        </Link>
                      </div>
                    </div>
                  )}
                  {launch?.error && (
                    <p className="mt-4 mx-auto max-w-md rounded-lg border border-accent-300 bg-accent-50 p-2.5 text-[11px] text-accent-900 text-start">
                      <i className="ri-error-warning-line me-1" />{t('awx_job_launch_failed_hint')}
                      <span className="block mt-0.5 font-label text-[10px] break-words" dir="ltr">{launch.error}</span>
                    </p>
                  )}
                  <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <button type="button" onClick={() => { setReference(null); setLaunch(null); setFormKey((k) => k + 1); }} className="px-5 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer">{t('new_request')}</button>
                    <Link to="/requests" className="px-5 py-2.5 rounded-lg border border-background-300 text-sm whitespace-nowrap cursor-pointer">{t('nav_requests')}</Link>
                    <Link to="/" className="px-5 py-2.5 rounded-lg border border-background-300 text-sm whitespace-nowrap cursor-pointer">{t('back_catalog')}</Link>
                  </div>
                </div>
                <SimulatedEmail reference={reference} serviceName={tx(service.name, i18n.language)} />
              </>
            ) : (
              <>
                {submitError && (
                  <div className="mb-4 p-3 rounded-lg bg-accent-50 border border-accent-300 text-sm text-accent-900 flex items-start gap-2">
                    <i className="ri-error-warning-line mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}
                <div className={submitting ? 'opacity-60 pointer-events-none' : ''}>
                  <DynamicForm key={`${schema.id}-${formKey}`} schema={schema} onValuesChange={setValues} onSubmit={submit} />
                </div>
              </>
            )}
          </div>
          <div className="w-full lg:w-[340px] shrink-0">
            <RequestSummary approval={service.approval} minutes={service.estimatedMinutes} values={values} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}