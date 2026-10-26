import { useTranslation } from 'react-i18next';
import useReadOnly from '@/hooks/useReadOnly';

/**
 * Bandeau affiché en haut des pages d'administration quand le rôle est
 * approbateur : toutes les données restent consultables, les actions non.
 */
export default function ReadOnlyNotice() {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  if (!readOnly) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-secondary-300 bg-secondary-100 px-4 py-3 flex items-start gap-2.5"
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0 text-secondary-900">
        <i className="ri-eye-line" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-secondary-900">{t('admin_readonly_title')}</p>
        <p className="text-xs text-secondary-900/85 leading-relaxed">{t('admin_readonly_body')}</p>
      </div>
    </div>
  );
}