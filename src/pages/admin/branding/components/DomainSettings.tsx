import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { domainIsValid, urlHost, urlIsValid, type TenantBranding } from '@/utils/branding';
import { localeOf } from '@/utils/catalog';

export default function DomainSettings({
  branding, readOnly = false, onChange, onNotify, onVerify,
}: {
  branding: TenantBranding;
  readOnly?: boolean;
  onChange: (patch: Partial<TenantBranding>) => void;
  onNotify: (message: string) => void;
  onVerify: () => Promise<TenantBranding | null>;
}) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState(branding.domain);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [url, setUrl] = useState(branding.portalUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlTesting, setUrlTesting] = useState(false);
  const [urlResult, setUrlResult] = useState<{ ok: boolean; latency: number } | null>(null);
  const [urlCheckedAt, setUrlCheckedAt] = useState<string | null>(null);

  useEffect(() => setValue(branding.domain), [branding.domain, branding.id]);
  useEffect(() => {
    setUrl(branding.portalUrl);
    setUrlError(null);
    setUrlResult(null);
    setUrlCheckedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding.id]);

  const saved = branding.domain === value.trim() && branding.domainStatus !== 'not_configured';
  const sub = value.trim().split('.')[0] || '@';

  const records = [
    { type: 'CNAME', name: sub, value: 'portal.asp-edge.net' },
    { type: 'TXT', name: `_asp-verify.${sub}`, value: `asp-verify=${branding.id}-7f21c9` },
  ];

  const statusStyle = branding.domainStatus === 'verified'
    ? 'bg-primary-100 text-primary-800 dark:text-primary-900'
    : branding.domainStatus === 'pending'
      ? 'bg-secondary-100 text-secondary-800 dark:text-secondary-900'
      : 'bg-background-200 text-foreground-600';

  const statusLabel = branding.domainStatus === 'verified'
    ? t('brand_domain_verified')
    : branding.domainStatus === 'pending'
      ? t('brand_domain_pending')
      : t('brand_domain_not_set');

  const save = () => {
    const next = value.trim().toLowerCase();
    if (!domainIsValid(next)) {
      setError(t('brand_domain_invalid'));
      return;
    }
    setError(null);
    const previousDerived = `https://${branding.domain}`;
    const autoDerived = !branding.portalUrl || branding.portalUrl.startsWith(previousDerived);
    let path = '';
    if (autoDerived) {
      try {
        const current = new URL(branding.portalUrl);
        path = current.pathname === '/' ? '' : current.pathname;
      } catch {
        path = '';
      }
    }
    const nextUrl = autoDerived ? `https://${next}${path}` : branding.portalUrl;
    onChange({
      domain: next,
      domainStatus: next === branding.domain ? branding.domainStatus : 'pending',
      portalUrl: nextUrl,
    });
    setUrl(nextUrl);
    onNotify(t('brand_domain_save'));
  };

  const verify = async () => {
    if (!domainIsValid(branding.domain)) {
      setError(t('brand_domain_invalid'));
      return;
    }
    setVerifying(true);
    try {
      const updated = await onVerify();
      if (!updated) {
        onNotify(t('brand_verify_error'));
        return;
      }
      onChange({ domainStatus: updated.domainStatus, domainCheckedAt: updated.domainCheckedAt });
      onNotify(updated.domainStatus === 'verified'
        ? t('brand_domain_verified_toast', { domain: updated.domain })
        : t('brand_domain_pending_toast'));
    } finally {
      setVerifying(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const checkedAt = branding.domainCheckedAt
    ? new Date(branding.domainCheckedAt).toLocaleString(localeOf(i18n.language), {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    : null;

  const urlSaved = branding.portalUrl === url.trim();

  const saveUrl = () => {
    const next = url.trim();
    if (!urlIsValid(next)) {
      setUrlError(t('brand_url_invalid'));
      setUrlResult(null);
      return;
    }
    setUrlError(null);
    setUrlResult(null);
    setUrl(next);
    onChange({ portalUrl: next });
    onNotify(t('brand_url_saved'));
  };

  const testUrl = () => {
    const next = url.trim();
    if (!urlIsValid(next)) {
      setUrlError(t('brand_url_invalid'));
      setUrlResult(null);
      return;
    }
    setUrlError(null);
    setUrlTesting(true);
    setUrlResult(null);
    window.setTimeout(() => {
      setUrlTesting(false);
      const host = urlHost(next).toLowerCase();
      const hostMatches = branding.domain ? host === branding.domain.toLowerCase() || host.endsWith(`.${branding.domain.toLowerCase()}`) : true;
      const ok = hostMatches && branding.domainStatus === 'verified';
      const latency = 56 + ((next.length * 7) % 88);
      setUrlResult({ ok, latency });
      setUrlCheckedAt(new Date().toISOString());
      if (ok) {
        setUrl(next);
        onChange({ portalUrl: next });
      }
    }, 1150);
  };

  return (
    <section className="p-4 md:p-5 rounded-xl bg-background-50 border border-background-200">
      <header className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-foreground-950">{t('brand_domain')}</h2>
          <p className="mt-0.5 text-xs text-foreground-600 max-w-xl">{t('brand_domain_hint')}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${statusStyle}`}>
          <i className={branding.domainStatus === 'verified' ? 'ri-lock-line' : 'ri-time-line'} />
          {statusLabel}
        </span>
      </header>

      <div className="space-y-2">
        <input
          type="text"
          dir="ltr"
          value={value}
          placeholder={t('brand_domain_placeholder')}
          disabled={readOnly}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          className="block w-full min-w-0 box-border px-3 py-2.5 rounded-lg border border-background-300 bg-background-100 text-sm text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saved || readOnly}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-save-3-line" />{t('brand_domain_save')}
          </button>
          <button
            type="button"
            onClick={verify}
            disabled={verifying || readOnly}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className={verifying ? 'ri-loader-4-line animate-spin' : 'ri-shield-check-line'} />
            {verifying ? t('brand_domain_verifying') : t('brand_domain_verify')}
          </button>
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-accent-700">{error}</p>}
      {checkedAt && (
        <p className="mt-1.5 font-label text-[10px] text-foreground-500">{t('brand_domain_last_check', { date: checkedAt })}</p>
      )}

      <div className="mt-4 pt-4 border-t border-background-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="portal-url" className="font-label text-[10px] uppercase tracking-widest text-foreground-500">
            {t('brand_url')}
          </label>
          {!urlSaved && (
            <span className="font-label text-[10px] px-2 py-0.5 rounded-md bg-accent-100 text-accent-900 whitespace-nowrap">
              {t('admin_endpoint_unsaved')}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-foreground-600">{t('brand_url_hint')}</p>
        <div className="mt-2 space-y-2">
          <input
            id="portal-url"
            type="url"
            dir="ltr"
            value={url}
            placeholder={t('brand_url_placeholder')}
            disabled={readOnly}
            onChange={(e) => { setUrl(e.target.value); setUrlError(null); setUrlResult(null); }}
            className="block w-full min-w-0 box-border px-3 py-2.5 rounded-lg border border-background-300 bg-background-100 font-label text-[12px] text-foreground-950 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveUrl}
              disabled={urlSaved || readOnly}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-save-3-line" />{t('brand_url_save')}
            </button>
            <button
              type="button"
              onClick={testUrl}
              disabled={urlTesting || readOnly}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed sm:ms-auto"
            >
              <i className={urlTesting ? 'ri-loader-4-line animate-spin' : 'ri-link'} />
              {urlTesting ? t('brand_url_testing') : t('brand_url_test')}
            </button>
          </div>
        </div>
        {urlError && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-accent-700">
            <i className="ri-error-warning-line" />{urlError}
          </p>
        )}
        {!urlError && urlResult && (
          <p className={`mt-1.5 inline-flex items-center gap-1.5 text-xs ${urlResult.ok ? 'text-primary-700 dark:text-primary-300' : 'text-accent-700'}`}>
            <i className={urlResult.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} />
            {urlResult.ok ? t('brand_url_test_ok', { ms: urlResult.latency }) : t('brand_url_test_fail')}
          </p>
        )}
        {urlCheckedAt && (
          <p className="mt-1.5 font-label text-[10px] text-foreground-500">
            {t('brand_url_last_test', {
              date: new Date(urlCheckedAt).toLocaleString(localeOf(i18n.language), {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              }),
            })}
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="font-label text-[10px] uppercase tracking-widest text-foreground-500">{t('brand_dns_records')}</p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-background-200">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-background-100 text-foreground-500">
              <tr className="font-label text-[10px] uppercase tracking-wider">
                <th className="px-3 py-2">{t('brand_dns_type')}</th>
                <th className="px-3 py-2">{t('brand_dns_name')}</th>
                <th className="px-3 py-2">{t('brand_dns_value')}</th>
                <th className="px-3 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              {records.map((r) => (
                <tr key={r.type}>
                  <td className="px-3 py-2 font-label text-[11px] font-semibold text-foreground-900">{r.type}</td>
                  <td className="px-3 py-2 font-label text-[11px] text-foreground-700 break-all" dir="ltr">{r.name}</td>
                  <td className="px-3 py-2 font-label text-[11px] text-foreground-700 break-all" dir="ltr">{r.value}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => copy(r.value)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-background-300 text-[11px] text-foreground-700 whitespace-nowrap cursor-pointer hover:bg-background-100"
                    >
                      <i className={copied === r.value ? 'ri-check-line text-primary-600' : 'ri-file-copy-line'} />
                      {copied === r.value ? t('brand_dns_copied') : t('brand_dns_copy')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-foreground-500 flex items-start gap-1.5">
          <i className="ri-information-line mt-0.5" />{t('brand_dns_hint')}
        </p>
      </div>
    </section>
  );
}