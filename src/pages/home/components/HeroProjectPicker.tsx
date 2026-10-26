import { useTranslation } from 'react-i18next';
import type { ProjectId, ProjectItem } from '@/types/catalog';

interface Props {
  active: ProjectId | 'all';
  counts: Partial<Record<ProjectId, number>>;
  projects: ProjectItem[];
  total: number;
  onSelect: (project: ProjectId | 'all') => void;
}

const chipBase = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] md:text-xs whitespace-nowrap border transition-colors cursor-pointer';
const chipIdle = 'border-background-50/20 dark:border-foreground-950/20 bg-background-50/5 dark:bg-foreground-950/5 hover:border-primary-400 hover:bg-background-50/10 dark:hover:bg-foreground-950/10';
const chipActive = 'bg-primary-500 text-background-50 border-primary-500 dark:text-foreground-950';

export default function HeroProjectPicker({ active, counts, projects, total, onSelect }: Props) {
  const { t } = useTranslation();

  if (projects.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="font-label text-[10px] uppercase tracking-[0.18em] opacity-60">{t('hero_project_pick')}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSelect('all')}
          aria-pressed={active === 'all'}
          className={`${chipBase} ${active === 'all' ? chipActive : chipIdle}`}
        >
          <span className="w-4 h-4 flex items-center justify-center"><i className="ri-stack-line" /></span>
          {t('project_all')}
          <span className="opacity-70 tabular-nums">{total}</span>
        </button>
        {projects.map((p) => {
          const n = counts[p.id] || 0;
          return (
            <button
              key={p.id}
              type="button"
              disabled={n === 0}
              onClick={() => onSelect(p.id)}
              aria-pressed={active === p.id}
              className={`${chipBase} ${n === 0 ? 'opacity-40 cursor-not-allowed border-background-50/15 dark:border-foreground-950/15' : active === p.id ? chipActive : chipIdle}`}
            >
              <span className="w-4 h-4 flex items-center justify-center"><i className={p.icon || 'ri-folder-line'} /></span>
              {t(`proj_${p.id}`)}
              <span className="opacity-70 tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}