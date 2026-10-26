import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ApprovalBadge from '@/components/base/ApprovalBadge';
import { projectIconOf } from '@/utils/store';
import { tx } from '@/utils/catalog';
import type { ServiceItem } from '@/types/catalog';

export default function ServiceCard({ service, index }: { service: ServiceItem; index: number }) {
  const { t, i18n } = useTranslation();
  return (
    <article className="asp-rise group flex flex-col p-4 md:p-5 rounded-xl bg-background-50 border border-background-200 hover:border-primary-400 hover:shadow-lg hover:shadow-primary-500/5 transition-all" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <span className="w-11 h-11 rounded-lg bg-background-100 border border-background-200 text-primary-600 flex items-center justify-center group-hover:bg-primary-500 group-hover:text-background-50 group-hover:border-primary-500 transition-colors">
          <i className={`${service.icon} text-xl`} />
        </span>
        <span className="font-label text-[11px] uppercase tracking-wider text-foreground-500">{t(`cat_${service.category}`)}</span>
      </div>
      <h3 className="mt-4 font-heading font-semibold text-sm md:text-base text-foreground-950">{tx(service.name, i18n.language)}</h3>
      <span className="mt-2 inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-background-100 border border-background-200 text-foreground-600 font-label text-[10px] uppercase tracking-wider whitespace-nowrap">
        <i className={projectIconOf(service.project)} />
        {t(`proj_${service.project}`)}
      </span>
      <p className="mt-1.5 text-xs md:text-sm text-foreground-600 leading-relaxed flex-1">{tx(service.description, i18n.language)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ApprovalBadge level={service.approval} />
        <span className="inline-flex items-center gap-1 font-label text-[11px] text-foreground-500 whitespace-nowrap">
          <i className="ri-time-line" />
          ~{service.estimatedMinutes} {t('minutes')}
        </span>
      </div>
      <Link to={`/services/${service.id}`} className="mt-4 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-background-300 text-sm font-medium text-foreground-900 group-hover:bg-primary-500 group-hover:text-background-50 group-hover:border-primary-500 dark:group-hover:text-foreground-950 transition-colors whitespace-nowrap cursor-pointer">
        {t('order')}
        <i className="ri-arrow-right-line" />
      </Link>
    </article>
  );
}