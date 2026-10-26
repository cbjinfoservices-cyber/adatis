import type { CategoryId, I18nText } from '@/types/catalog';

/**
 * Helpers de présentation du catalogue.
 * Les données proviennent désormais exclusivement de l'API (voir utils/store.ts).
 */

export const CATEGORY_ORDER: CategoryId[] = [
  'infrastructure', 'cloud', 'containers', 'applications', 'databases', 'network',
  'security', 'storage', 'identity', 'messaging', 'monitoring', 'backup', 'custom',
];

const DATE_LOCALES: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
  ar: 'ar-EG',
};

export const baseLang = (lang: string) => (lang || 'fr').split('-')[0];

/** Locale de formatage des dates, alignée sur la langue courante. */
export const localeOf = (lang: string) => DATE_LOCALES[baseLang(lang)] || 'en-GB';

export const tx = (text: I18nText | undefined, lang: string): string => {
  if (!text) return '';
  const record = text as unknown as Record<string, string>;
  return record[baseLang(lang)] || record.en || record.fr || '';
};