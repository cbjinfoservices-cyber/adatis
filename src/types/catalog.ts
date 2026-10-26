export type Lang = 'fr' | 'en';
export type I18nText = { fr: string; en: string };

export type CategoryId =
  | 'infrastructure' | 'cloud' | 'containers' | 'applications' | 'databases'
  | 'network' | 'security' | 'storage' | 'identity' | 'messaging'
  | 'monitoring' | 'backup' | 'custom';

export type ProjectId = 'crm' | 'cloud' | 'soc2' | 'hr' | 'observability';

export interface ProjectItem {
  id: ProjectId;
  icon: string;
}

export type ApprovalLevel = 'none' | 'manager' | 'technical' | 'security' | 'multi';

export interface ServiceItem {
  id: string;
  name: I18nText;
  category: CategoryId;
  project: ProjectId;
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