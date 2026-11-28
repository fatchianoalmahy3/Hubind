export type FieldType = 
  | 'text' 
  | 'number' 
  | 'select' 
  | 'textarea' 
  | 'date' 
  | 'badge' 
  | 'image' 
  | 'boolean';

export interface SelectOption {
  label: string;
  value: string | number;
  badgeColor?: string;
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp | string;
  customError?: string;
}

export interface FieldConfig<T = any> {
  key: keyof T | string;
  label: string;
  type: FieldType;
  isTableColumn: boolean;
  isFormInput?: boolean;
  hiddenInForm?: boolean;
  isFilterable?: boolean;
  isSearchable?: boolean;
  isSortable?: boolean;
  options?: SelectOption[];
  validation?: FieldValidation;
  placeholder?: string;
  helperText?: string;
  defaultValue?: any;
  disabled?: boolean;
  autocomplete?: boolean;
  numericFormattedInput?: boolean;
  visibleWhen?: { field: string; equals: any };
  labelWhen?: { field: string; equals: any; label: string };
  helperTextWhen?: { field: string; equals: any; helperText: string };
  clearDependentsWhenNotEquals?: { equals: any; targetFields: string[] };
  deriveCodeToField?: string;
  gradeScoreConfig?: {
    siblingKeys: string[];
    averageField: string;
    predikatField?: string;
  };
  allowedRoles?: string[];
  relationSource?: 'jurusan' | 'kelas' | 'dudi' | 'guru' | 'siswa';
  allowCustomValue?: boolean;
  renderCell?: (value: any, row: T) => React.ReactNode;
}

export interface StatCardConfig {
  title: string;
  valueKey?: string;
  computedValue?: (data: any[]) => string | number;
  icon: string;
  change?: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

export interface BulkActionConfig<T = any> {
  id: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'danger' | 'success' | 'warning';
  action: (selectedRows: T[]) => Promise<void> | void;
}

export interface ModuleMetadata<T = any> {
  id: string;
  title: string;
  subtitle: string;
  tableName: string; // Google Spreadsheet Sheet Name
  icon: string;
  allowedRoles?: string[];
  studentValidationMode?: 'master_unique' | 'required_master' | 'optional_master';
  canonicalizeJurusanCode?: boolean;
  preventDuplicateActivePlacement?: boolean;
  syncPerizinanDateRange?: boolean;
  statCards: StatCardConfig[];
  fields: FieldConfig<T>[];
  bulkActions?: BulkActionConfig<T>[];
  customActions?: {
    label: string;
    icon: string;
    action: (row: T) => void;
  }[];
}

export interface FilterState {
  [key: string]: any;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface SortState {
  column: string | null;
  direction: 'asc' | 'desc';
}

export interface QueryResult<T> {
  data: T[];
  filteredData?: T[];
  total: number;
  page: number;
  pageSize: number;
}
