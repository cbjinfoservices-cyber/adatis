import { useTranslation } from 'react-i18next';

export type SortKey = 'popular' | 'fastest' | 'az';

const SORTS: { key: SortKey; labelKey: string; icon: string }[] = [
  { key: 'popular', labelKey: 'sort_popular', icon: 'ri-fire-line' },
  { key: 'fastest', labelKey: 'sort_fastest', icon: 'ri-flashlight-line' },
  { key: 'az', labelKey: 'sort_az', icon: 'ri-sort-alphabet-asc' },
];

interface Props {
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  grouped: boolean;
  onToggleGroup: () => void;
  showGroupToggle: boolean;
}

export default function CatalogToolbar({
  sort, onSort, grouped, onToggleGroup, showGroupToggle,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full border border-background-200 bg-background-50">
        <span className="ps-2 pe-1 font-label text-[10px] uppercase tracking-wider text-foreground-500 whitespace-nowrap">{t('sort_label')}</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSort(s.key)}
            aria-pressed={sort === s.key}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors cursor-pointer ${sort === s.key ? 'bg-foreground-950 text-background-50' : 'text-foreground-700 hover:bg-background-200'}`}
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center"><i className={s.icon} /></span>
            {t(s.labelKey)}
          </button>
        ))}
      </div>
      {showGroupToggle && (
        <button
          type="button"
          onClick={onToggleGroup}
          aria-pressed={grouped}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-colors cursor-pointer ${grouped ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-background-200 bg-background-50 text-foreground-700 hover:border-primary-400'}`}
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center"><i className={grouped ? 'ri-checkbox-circle-line' : 'ri-layout-row-line'} /></span>
          {t('group_by_category')}
        </button>
      )}
    </div>
  );
}