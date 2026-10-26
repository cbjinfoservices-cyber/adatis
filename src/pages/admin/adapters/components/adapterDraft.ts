export interface AdapterIconOption {
  icon: string;
  labelKey: string;
}

export const ADAPTER_ICON_OPTIONS: AdapterIconOption[] = [
  { icon: 'ri-plug-line', labelKey: 'adapt_icon_plug' },
  { icon: 'ri-flashlight-line', labelKey: 'adapt_icon_auto' },
  { icon: 'ri-hammer-line', labelKey: 'adapt_icon_tool' },
  { icon: 'ri-stack-line', labelKey: 'adapt_icon_stack' },
  { icon: 'ri-git-branch-line', labelKey: 'adapt_icon_branch' },
  { icon: 'ri-microsoft-line', labelKey: 'adapt_icon_windows' },
  { icon: 'ri-node-tree', labelKey: 'adapt_icon_tree' },
  { icon: 'ri-terminal-box-line', labelKey: 'adapt_icon_terminal' },
  { icon: 'ri-ticket-2-line', labelKey: 'adapt_icon_ticket' },
  { icon: 'ri-settings-5-line', labelKey: 'adapt_icon_config' },
  { icon: 'ri-cloud-line', labelKey: 'adapt_icon_cloud' },
  { icon: 'ri-database-2-line', labelKey: 'adapt_icon_db' },
  { icon: 'ri-shield-keyhole-line', labelKey: 'adapt_icon_security' },
  { icon: 'ri-flow-chart', labelKey: 'adapt_icon_flow' },
];

export const ADAPTER_ICONS = ADAPTER_ICON_OPTIONS.map((option) => option.icon);

export interface AdapterDraft {
  kind: string;
  name: string;
  icon: string;
  descriptionFr: string;
  descriptionEn: string;
}

export const KIND_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 32)
  .replace(/-+$/g, '');

export const emptyDraft = (): AdapterDraft => ({
  kind: '',
  name: '',
  icon: 'ri-plug-line',
  descriptionFr: '',
  descriptionEn: '',
});