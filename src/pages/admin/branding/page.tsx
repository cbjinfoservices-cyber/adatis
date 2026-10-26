import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/feature/AppShell';
import AdminTabs from '@/pages/admin/components/AdminTabs';
import { ErrorBlock, LoadingBlock } from '@/components/base/DataState';
import ReadOnlyNotice from '@/components/base/ReadOnlyNotice';
import useReadOnly from '@/hooks/useReadOnly';
import BrandingIdentity from '@/pages/admin/branding/components/BrandingIdentity';
import PalettePicker from '@/pages/admin/branding/components/PalettePicker';
import DomainSettings from '@/pages/admin/branding/components/DomainSettings';
import EmailSettings from '@/pages/admin/branding/components/EmailSettings';
import BrandingPreview from '@/pages/admin/branding/components/BrandingPreview';
import UserPreview from '@/pages/admin/branding/components/UserPreview';
import { reloadStore, patchStore, useStore } from '@/utils/store';
import {
  applyPalette, fetchTenantBranding, getActiveTenantId, notifyBrandingUpdated,
  resolveActiveBranding, saveTenantBranding, setActiveTenantId, verifyTenantDomain,
  type TenantBranding,
} from '@/utils/branding';

export default function BrandingPage() {
  const { t } = useTranslation();
  const { tenants, status, error, failedResources } = useStore();
  const readOnly = useReadOnly();
  const [activeId, setActiveId] = useState(() => getActiveTenantId());
  const [edits, setEdits] = useState<Partial<TenantBranding>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const saved = useMemo(() => resolveActiveBranding(tenants, activeId), [tenants, activeId]);
  const draft = useMemo(() => ({ ...saved, ...edits }), [saved, edits]);
  const dirty = useMemo(
    () => (Object.keys(edits) as (keyof TenantBranding)[]).some((key) => edits[key] !== saved[key]),
    [edits, saved],
  );

  useEffect(() => {
    if (!dirty) applyPalette(saved.palette);
  }, [saved.palette, dirty]);

  const patch = (partial: Partial<TenantBranding>) => setEdits((prev) => ({ ...prev, ...partial }));

  const replaceTenant = (tenant: TenantBranding) => {
    patchStore({
      tenants: tenants.map((item) => (item.id === tenant.id ? tenant : item)),
    });
    setEdits({});
  };

  const pickTenant = (id: string) => {
    const next = tenants.find((tenant) => tenant.id === id);
    if (!next) return;
    setActiveId(id);
    setActiveTenantId(id);
    setEdits({});
    applyPalette(next.palette);
    notifyBrandingUpdated();
  };

  const choosePalette = (id: string) => {
    patch({ palette: id });
    applyPalette(id);
  };

  const save = async () => {
    if (!draft.id) return;
    setBusy(true);
    try {
      const updated = await saveTenantBranding(draft.id, draft);
      replaceTenant(updated);
      setActiveId(updated.id);
      setActiveTenantId(updated.id);
      applyPalette(updated.palette);
      notifyBrandingUpdated();
      setToast(t('brand_saved', { tenant: updated.name }));
    } catch {
      setToast(t('brand_save_error'));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!draft.id) return;
    setBusy(true);
    try {
      const fresh = await fetchTenantBranding(draft.id);
      replaceTenant(fresh);
      applyPalette(fresh.palette);
      notifyBrandingUpdated();
      setToast(t('brand_reset_done'));
    } catch {
      setEdits({});
      applyPalette(saved.palette);
      setToast(t('brand_reset_error'));
    } finally {
      setBusy(false);
    }
  };

  const verifyDomain = async () => {
    if (!draft.id) return null;
    try {
      const updated = await verifyTenantDomain(draft.id);
      replaceTenant(updated);
      return updated;
    } catch {
      return null;
    }
  };

  const failed = failedResources.includes('tenants') || status === 'error';
  const loading = (status === 'loading' || status === 'idle') && tenants.length === 0;

  const toastNode = toast && (
    <div className="fixed bottom-6 right-4 md:right-8 z-50 max-w-sm p-3.5 rounded-xl bg-foreground-950 text-background-50 shadow-lg flex items-start gap-2.5">
      <span className="w-5 h-5 flex items-center justify-center text-primary-300 shrink-0"><i className="ri-information-line" /></span>
      <p className="text-sm">{toast}</p>
      <button type="button" onClick={() => setToast(null)} aria-label={t('admin_close')} className="ml-2 w-5 h-5 flex items-center justify-center text-background-300 hover:text-background-50 cursor-pointer">
        <i className="ri-close-line" />
      </button>
    </div>
  );

  return (
    <AppShell>
      <div className="px-4 md:px-10 py-6 md:py-8 space-y-5">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground-950">{t('brand_title')}</h1>
            <p className="mt-1 text-sm text-foreground-600 max-w-2xl">{t('brand_subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              disabled={!draft.id}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-primary-400 bg-primary-500/10 text-sm font-semibold text-primary-700 dark:text-primary-300 whitespace-nowrap cursor-pointer hover:bg-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-eye-line" />{t('brand_preview_user')}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy || !draft.id || readOnly}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-background-300 bg-background-50 text-sm font-semibold text-foreground-800 whitespace-nowrap cursor-pointer hover:bg-background-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={busy ? 'ri-loader-4-line animate-spin' : 'ri-arrow-go-back-line'} />{t('brand_reset')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || busy || readOnly}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-background-50 dark:text-foreground-950 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={busy ? 'ri-loader-4-line animate-spin' : 'ri-save-3-line'} />{t('brand_save')}
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <AdminTabs />
          {draft.id && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${dirty ? 'bg-accent-100 text-accent-900' : 'bg-background-200 text-foreground-600'}`}>
              <i className={dirty ? 'ri-edit-circle-line' : 'ri-checkbox-circle-line'} />
              {dirty ? t('brand_unsaved') : t('brand_saved_state')}
            </span>
          )}
        </div>

        <ReadOnlyNotice />

        {failed ? (
          <ErrorBlock message={error} onRetry={() => reloadStore()} />
        ) : loading ? (
          <LoadingBlock />
        ) : tenants.length === 0 ? (
          <section className="rounded-xl border border-dashed border-background-300 bg-background-50 p-8 text-center">
            <span className="w-12 h-12 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
              <i className="ri-building-2-line text-xl" />
            </span>
            <h2 className="mt-2.5 font-heading font-semibold text-foreground-950">{t('brand_empty_title')}</h2>
            <p className="mt-1 text-sm text-foreground-600 max-w-md mx-auto">{t('brand_empty_hint')}</p>
          </section>
        ) : (
          <>
            <section>
              <div className="flex flex-wrap items-baseline gap-2 mb-2">
                <h2 className="font-heading font-semibold text-foreground-950">{t('brand_tenants')}</h2>
                <span className="text-[11px] text-foreground-500">{t('brand_tenant_hint')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {tenants.map((tenant) => {
                  const selected = tenant.id === draft.id;
                  return (
                    <button
                      key={tenant.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={t('brand_edit_tenant', { name: tenant.name })}
                      onClick={() => pickTenant(tenant.id)}
                      className={`text-start p-3.5 rounded-xl border cursor-pointer transition-colors ${selected ? 'border-primary-400 bg-primary-500/5 ring-1 ring-primary-400/40' : 'bg-background-50 border-background-200 hover:border-foreground-300'}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-9 h-9 rounded-lg bg-background-200 flex items-center justify-center shrink-0 overflow-hidden font-heading text-xs font-bold text-foreground-800">
                          {tenant.logo
                            ? <img src={tenant.logo} alt="" className="w-full h-full object-contain" />
                            : tenant.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-sm font-semibold text-foreground-950 truncate">{tenant.name}</span>
                            {tenant.id === activeId && (
                              <span className="font-label text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-secondary-100 text-secondary-900 whitespace-nowrap">
                                {t('brand_active')}
                              </span>
                            )}
                          </span>
                          <span className="block font-label text-[10px] uppercase tracking-widest text-foreground-500 truncate">
                            {tenant.plan} · {tenant.platformName}
                          </span>
                        </span>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${selected ? 'bg-primary-500 text-background-50 dark:text-foreground-950' : 'border border-background-300 text-transparent'}`}>
                          <i className="ri-check-line text-xs" />
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tenant.domainStatus === 'verified' ? 'bg-primary-500' : tenant.domainStatus === 'pending' ? 'bg-accent-500' : 'bg-background-400'}`} />
                        <span className="font-label text-[10px] text-foreground-600 truncate" dir="ltr">{tenant.domain || '—'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
              <div className="min-w-0 space-y-5">
                <BrandingIdentity
                  branding={draft}
                  readOnly={readOnly}
                  onChange={patch}
                  onNotify={(message) => setToast(message)}
                />
                <PalettePicker value={draft.palette} readOnly={readOnly} onChange={choosePalette} />
                <DomainSettings
                  branding={draft}
                  readOnly={readOnly}
                  onChange={patch}
                  onNotify={(message) => setToast(message)}
                  onVerify={verifyDomain}
                />
                <EmailSettings
                  branding={draft}
                  readOnly={readOnly}
                  onChange={patch}
                  onNotify={(message) => setToast(message)}
                />
              </div>

              <div className="w-full lg:sticky lg:top-20 space-y-4">
                <BrandingPreview branding={draft} />
                <section className="p-4 rounded-xl bg-background-50 border border-background-200">
                  <h2 className="font-heading font-semibold text-foreground-950">{t('brand_summary')}</h2>
                  <dl className="mt-3 space-y-2 text-sm">
                    {[
                      { k: t('brand_summary_plan'), v: draft.plan, ltr: false },
                      { k: t('brand_summary_users'), v: String(draft.users), ltr: false },
                      { k: t('brand_summary_services'), v: String(draft.services), ltr: false },
                      { k: t('brand_summary_domain'), v: draft.domain || '—', ltr: true },
                      { k: t('brand_summary_url'), v: draft.portalUrl || '—', ltr: true },
                    ].map((row) => (
                      <div key={row.k} className="flex items-center justify-between gap-2 pb-2 border-b border-background-200 last:border-0 last:pb-0">
                        <dt className="text-foreground-600 text-xs shrink-0">{row.k}</dt>
                        <dd className="font-medium text-foreground-950 text-xs truncate max-w-[60%]" dir={row.ltr ? 'ltr' : undefined}>{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[11px] text-foreground-500 flex items-start gap-1.5">
                    <i className="ri-lock-line mt-0.5" />{t('brand_note')}
                  </p>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {previewOpen && draft.id && <UserPreview branding={draft} onClose={() => setPreviewOpen(false)} />}
      {toastNode}
    </AppShell>
  );
}