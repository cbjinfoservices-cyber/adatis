export type Lang = 'fr' | 'en';
export type I18nText = { fr: string; en: string };

export type CategoryId =
  | 'infrastructure' | 'cloud' | 'containers' | 'applications' | 'databases'
  | 'network' | 'security' | 'storage' | 'identity' | 'messaging'
  | 'monitoring' | 'backup' | 'custom';

/** Projet Ascender (dépôt SCM) du job template d'un service. `id` : id AWX, en texte. */
export interface ProjectItem {
  id: string;
  name: string;
}

export const PROJECT_ICON = 'ri-git-repository-line';

export type ApprovalLevel = 'none' | 'manager' | 'technical' | 'security' | 'multi';

export interface ServiceItem {
  id: string;
  name: I18nText;
  category: CategoryId;
  /** Null : workflow (sans projet dans Ascender), service non relié ou sans session Ascender. */
  project: ProjectItem | null;
  description: I18nText;
  icon: string;
  approval: ApprovalLevel;
  estimatedMinutes: number;
  popularity: number;
  formId: string;
  tags: string[];
}

export type FieldType =
  | 'text' | 'textarea' | 'password' | 'email' | 'url' | 'number' | 'integer'
  | 'float' | 'date' | 'datetime' | 'checkbox' | 'radio' | 'select'
  | 'multiselect' | 'autocomplete' | 'file' | 'json' | 'yaml' | 'markdown' | 'tags';

export type FormatRule = 'ip' | 'cidr' | 'fqdn' | 'email' | 'url' | 'json' | 'yaml';

export interface FieldValidation {
  regex?: string;
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  format?: FormatRule;
}

export interface FieldOption { value: string; label: I18nText }

export interface FormField {
  name: string;
  type: FieldType;
  label: I18nText;
  required?: boolean;
  placeholder?: string;
  help?: I18nText;
  options?: FieldOption[];
  default?: string | number | boolean | string[];
  validation?: FieldValidation;
  section?: I18nText;
}

export interface UniversalFormSchema {
  id: string;
  title: I18nText;
  fields: FormField[];
}

export type FieldValue = string | number | boolean | string[] | null;