import { useTranslation } from 'react-i18next';
import { MAP_STYLE, publishedCount, reviewCount, type Connector } from '@/utils/connectors';
import { tx } from '@/utils/catalog';
import { formatDetailDate } from '@/pages/admin/connectors/components/detail/formatDate';

interface Props {
  connector: Connector;
  readOnly: boolean;
  onToggleMap: (itemId: string) => void;
}

/** Catalogue importé du moteur : publier ou ignorer chaque élément. */
export default function CatalogTable({ connector, readOnly, onToggleMap }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div className="border-t border-background-200">
      <div className="px-4 md:px-5 py-3.5 flex flex-wrap items-center gap-2">
        <div>
          <h3 className="font-heading font-semibold text-foreground-950">{t('admin_catalog_imported')}</h3>
          <p className="font-label text-[11px] text-foreground-500">{t('admin_catalog_hint')}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="font-label text-[10px] px-2 py-1 rounded-md bg-primary-100 text-primary-800 dark:text-primary-900">
            {publishedCount(connector)} {t('admin_map_mapped')}
          </span>
          <span className="font-label text-[10px] px-2 py-1 rounded-md bg-secondary-100 text-secondary-800 dark:text-secondary-900">
            {reviewCount(connector)} {t('admin_map_review')}
          </span>
        </div>
      </div>

      {connector.catalog.length === 0 ? (
        <div className="px-5 pb-8 pt-2 text-center">
          <span className="w-11 h-11 mx-auto rounded-full bg-background-200 text-foreground-600 flex items-center justify-center">
            <i className="ri-inbox-line" />
          </span>
          <p className="mt-2 text-sm text-foreground-600">{t('admin_catalog_empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left font-label text-[10px] uppercase tracking-wider text-foreground-500 bg-background-100">
                <th className="px-4 py-2.5 font-normal">{t('col_service')}</th>
                <th className="px-4 py-2.5 font-normal">{t('admin_engine_ref')}</th>
                <th className="px-4 py-2.5 font-normal">{t('admin_category')}</th>
                <th className="px-4 py-2.5 font-normal">{t('admin_mapping')}</th>
                <th className="px-4 py-2.5 font-normal">{t('admin_last_sync')}</th>
                <th className="px-4 py-2.5 font-normal text-right">{t('admin_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              {connector.catalog.map((item) => {
                const mapped = item.status === 'mapped';
                return (
                  <tr key={item.id} className="hover:bg-background-100">
                    <td className="px-4 py-2.5">
                      <span className="block font-medium text-foreground-950">{tx(item.name, lang)}</span>
                    </td>
                    <td className="px-4 py-2.5 font-label text-[11px] text-foreground-600 whitespace-nowrap" dir="ltr">{item.engineRef}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground-700 whitespace-nowrap">{t(`cat_${item.category}`)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-md font-label text-[10px] whitespace-nowrap ${MAP_STYLE[item.status]}`}>
                        {t(`admin_map_${item.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-label text-[10px] text-foreground-500 whitespace-nowrap">{formatDetailDate(item.lastSync, lang)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onToggleMap(item.id)}
                        disabled={readOnly}
                        title={readOnly ? t('admin_readonly_action') : undefined}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap cursor-pointer ${mapped ? 'border-background-300 text-foreground-700 hover:bg-background-200' : 'border-primary-400 text-primary-800 dark:text-primary-300 hover:bg-primary-100'}`}
                      >
                        <i className={mapped ? 'ri-eye-off-line' : 'ri-eye-line'} />
                        {mapped ? t('admin_ignore_action') : t('admin_map_action')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
