import { useTranslation } from 'react-i18next';
import ServiceCard from '@/pages/home/components/ServiceCard';
import { CATEGORY_ORDER } from '@/utils/catalog';
import { categoryIconOf } from '@/utils/store';
import type { ServiceItem } from '@/types/catalog';

interface Props {
  services: ServiceItem[];
  grouped: boolean;
}

const gridCls = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4';

export default function ServiceGrid({ services, grouped }: Props) {
  const { t } = useTranslation();

  if (!grouped) {
    return (
      <div className={`mt-6 ${gridCls}`}>
        {services.map((s, i) => <ServiceCard key={s.id} service={s} index={i} />)}
      </div>
    );
  }

  const groups = CATEGORY_ORDER
    .map((cat) => ({ cat, items: services.filter((s) => s.category === cat) }))
    .filter((g) => g.items.length > 0);

  let cursor = 0;

  return (
    <div className="mt-6 space-y-8">
      {groups.map((g) => {
        const start = cursor;
        cursor += g.items.length;
        return (
          <section key={g.cat}>
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-background-100 border border-background-200 text-primary-600 flex items-center justify-center shrink-0">
                <i className={`${categoryIconOf(g.cat)} text-base`} />
              </span>
              <h3 className="font-heading text-sm md:text-base font-semibold text-foreground-950 whitespace-nowrap">{t(`cat_${g.cat}`)}</h3>
              <span className="font-label text-[11px] px-1.5 py-0.5 rounded bg-background-200 text-foreground-700 tabular-nums">{g.items.length}</span>
              <span className="hidden sm:block flex-1 h-px bg-background-200" aria-hidden="true" />
            </div>
            <div className={`mt-3 ${gridCls}`}>
              {g.items.map((s, i) => <ServiceCard key={s.id} service={s} index={start + i} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}