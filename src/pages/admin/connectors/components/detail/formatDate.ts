import { localeOf } from '@/utils/catalog';

/** Date courte du détail d'un connecteur (« 12 oct., 14:05 »). */
export const formatDetailDate = (value: string, lang: string) =>
  new Date(value).toLocaleString(localeOf(lang), {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
