import { useTranslation } from 'react-i18next';
import type { ApprovalLevel } from '@/types/catalog';

const STYLES: Record<ApprovalLevel, { cls: string; icon: string }> = {
  none: { cls: 'bg-primary-100 text-primary-800 dark:text-primary-900', icon: 'ri-flashlight-line' },
  manager: { cls: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900', icon: 'ri-user-star-line' },
  technical: { cls: 'bg-secondary-100 text-secondary-800 dark:text-secondary-900', icon: 'ri-tools-line' },
  security: { cls: 'bg-accent-100 text-accent-900', icon: 'ri-shield-check-line' },
  multi: { cls: 'bg-accent-100 text-accent-900', icon: 'ri-git-merge-line' },
};

export default function ApprovalBadge({ level }: { level: ApprovalLevel }) {
  const { t } = useTranslation();
  const s = STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-label text-[11px] whitespace-nowrap ${s.cls}`}>
      <i className={s.icon} />
      {t(`approval_${level}`)}
    </span>
  );
}