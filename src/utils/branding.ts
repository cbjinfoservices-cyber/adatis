import { api } from '@/utils/api';
import { httpUrlIsValid } from '@/utils/url';
import type { I18nText } from '@/types/catalog';

export type DomainStatus = 'verified' | 'pending' | 'not_set';

export interface TenantBranding {
  id: string;
  name: string;
  plan: string;
  platformName: string;
  tagline: string;
  logo: string;
  palette: string;
  domain: string;
  domainStatus: DomainStatus;
  domainCheckedAt: string | null;
  portalUrl: string;
  emailSubject: string;
  emailBody: string;
  users: number;
  services: number;
  /** Organisation Ascender dont les membres reçoivent ce tenant à la connexion. */
  awxOrganization: string;
}

export interface TenantPatch {
  platformName?: string;
  tagline?: string;
  logo?: string;
  palette?: string;
  domain?: string;
  portalUrl?: string;
  emailSubject?: string;
  emailBody?: string;
  awxOrganization?: string;
}

interface ColorSeed { h: number; c: number }

export interface Palette {
  id: string;
  label: I18nText;
  primary: ColorSeed;
  accent: ColorSeed;
  secondary: ColorSeed;
}

export const PALETTES: Palette[] = [
  {
    id: 'teal',
    label: { fr: 'Turquoise & ambre', en: 'Teal & amber' },
    primary: { h: 185, c: 0.12 },
    accent: { h: 68, c: 0.16 },
    secondary: { h: 60, c: 0.035 },
  },
  {
    id: 'emerald',
    label: { fr: 'Émeraude & sable', en: 'Emerald & sand' },
    primary: { h: 155, c: 0.13 },
    accent: { h: 82, c: 0.15 },
    secondary: { h: 150, c: 0.03 },
  },
  {
    id: 'clay',
    label: { fr: 'Terracotta & argile', en: 'Clay & terracotta' },
    primary: { h: 38, c: 0.11 },
    accent: { h: 18, c: 0.14 },
    secondary: { h: 45, c: 0.035 },
  },
  {
    id: 'graphite',
    label: { fr: 'Graphite & citron', en: 'Graphite & lime' },
    primary: { h: 130, c: 0.06 },
    accent: { h: 98, c: 0.16 },
    secondary: { h: 120, c: 0.02 },
  },
];

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const L_STOPS = [0.97, 0.94, 0.88, 0.8, 0.7, 0.58, 0.5, 0.43, 0.35, 0.28, 0.2];
const C_STOPS = [0.28, 0.42, 0.62, 0.85, 1, 1, 0.94, 0.8, 0.64, 0.48, 0.36];

const roleBlock = (role: string, seed: ColorSeed) =>
  SHADES.map((shade, i) => `  --${role}-${shade}: ${L_STOPS[i]} ${(seed.c * C_STOPS[i]).toFixed(4)} ${seed.h};`).join('\n');

const darkBlock = (role: string[], seeds: ColorSeed[]) => {
  const lines: string[] = [];
  const idx = [0, 1, 9, 10];
  role.forEach((r, ri) => {
    const seed = seeds[ri];
    const factors: Record<number, number> = { 0: 0.5, 1: 0.55, 9: 0.45, 10: 0.3 };
    const lights: Record<number, number> = { 0: 0.22, 1: 0.27, 9: 0.92, 10: 0.96 };
    idx.forEach((i) => {
      lines.push(`  --${r}-${SHADES[i]}: ${lights[i]} ${(seed.c * factors[i]).toFixed(4)} ${seed.h};`);
    });
  });
  return lines.join('\n');
};

export const paletteSwatch = (seed: ColorSeed, lightness = 0.58) => `oklch(${lightness} ${seed.c} ${seed.h})`;

export const paletteCss = (palette: Palette) => `.palette-${palette.id} {
${roleBlock('primary', palette.primary)}
${roleBlock('accent', palette.accent)}
${roleBlock('secondary', palette.secondary)}
}
.dark.palette-${palette.id} {
${darkBlock(['primary', 'accent', 'secondary'], [palette.primary, palette.accent, palette.secondary])}
}`;

export const PALETTE_STYLE_ID = 'asp-branding-palette';

export const applyPalette = (id: string) => {
  const palette = PALETTES.find((p) => p.id === id) || PALETTES[0];
  let style = document.getElementById(PALETTE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PALETTE_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = PALETTES.map(paletteCss).join('\n');
  document.documentElement.classList.remove(...PALETTES.map((p) => `palette-${p.id}`));
  document.documentElement.classList.add(`palette-${palette.id}`);
};

export const EMAIL_TOKENS = ['{{ref}}', '{{service}}', '{{platform}}'] as const;

export const renderEmailTemplate = (
  template: string,
  values: { ref: string; service: string; platform: string },
) => template
  .replace(/\{\{\s*ref\s*\}\}/g, values.ref)
  .replace(/\{\{\s*service\s*\}\}/g, values.service)
  .replace(/\{\{\s*platform\s*\}\}/g, values.platform);

/* --- Tenant actif (simple préférence d'interface, conservée localement) --- */

const ACTIVE_KEY = 'asp-active-tenant';

export const getActiveTenantId = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY) || '';
  } catch {
    return '';
  }
};

export const setActiveTenantId = (id: string) => {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* préférence non persistée : l'état reste en mémoire */
  }
};

export const BRANDING_EVENT = 'asp-branding-updated';

export const notifyBrandingUpdated = () => window.dispatchEvent(new Event(BRANDING_EVENT));

/**
 * Identité minimale utilisée uniquement pour l'habillage de l'application
 * tant que l'API n'a pas répondu. Aucune donnée métier ici.
 */
export const FALLBACK_BRANDING: TenantBranding = {
  id: '',
  name: '—',
  plan: '—',
  platformName: 'Service Portal',
  tagline: 'Self-service',
  logo: '',
  palette: PALETTES[0].id,
  domain: '',
  domainStatus: 'not_set',
  domainCheckedAt: null,
  portalUrl: '',
  emailSubject: '',
  emailBody: '',
  users: 0,
  services: 0,
  awxOrganization: '',
};

export const resolveActiveBranding = (
  tenants: TenantBranding[],
  activeId?: string,
): TenantBranding => {
  if (!tenants.length) return FALLBACK_BRANDING;
  return tenants.find((t) => t.id === activeId) || tenants[0];
};

/* --- Écriture en base -------------------------------------------------- */

export const brandingPayload = (branding: TenantBranding): TenantPatch => ({
  platformName: branding.platformName,
  tagline: branding.tagline,
  logo: branding.logo,
  palette: branding.palette,
  domain: branding.domain,
  portalUrl: branding.portalUrl,
  emailSubject: branding.emailSubject,
  emailBody: branding.emailBody,
  awxOrganization: branding.awxOrganization,
});

export const saveTenantBranding = (id: string, branding: TenantBranding) =>
  api.patch<TenantBranding>(`/tenants/${id}`, brandingPayload(branding));

export const fetchTenantBranding = (id: string) => api.get<TenantBranding>(`/tenants/${id}`);

export const verifyTenantDomain = (id: string) =>
  api.post<TenantBranding & { dnsResolved?: boolean }>(`/tenants/${id}/verify-domain`);

/* --- Validation ------------------------------------------------------- */

export const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;

export const domainIsValid = (value: string) => DOMAIN_PATTERN.test(value.trim().toLowerCase());

export const urlIsValid = httpUrlIsValid;

export const urlHost = (value: string) => {
  try {
    return new URL(value.trim()).hostname;
  } catch {
    return '';
  }
};