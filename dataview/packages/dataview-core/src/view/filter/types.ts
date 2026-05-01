import type {
  FieldId,
  FilterOperator,
  FilterPresetId,
  FilterRule,
  FilterValuePreview
} from '@dataview/core/types'

export interface FilterPreset {
  id: FilterPresetId
  operator: FilterOperator
  valueMode: 'none' | 'fixed' | 'editable'
  fixedValue?: FilterRule['value']
}

export type FilterEditorKind =
  | 'none'
  | 'text'
  | 'number'
  | 'date'
  | 'option-set'

export type FilterFamily =
  | 'text'
  | 'comparable-number'
  | 'comparable-date'
  | 'single-option'
  | 'multi-option'
  | 'boolean'
  | 'presence'

export interface FilterFamilyConfig {
  family: FilterFamily
  defaultPresetId: FilterPresetId
  presets: readonly FilterPreset[]
  editableValueKind: FilterEditorKind
}

export type FilterQueryAnalysis =
  | {
      kind: 'scan'
    }
  | {
      kind: 'bucket'
      mode: 'include' | 'exclude'
      keys: readonly string[]
    }
  | {
      kind: 'sort'
      mode: 'exists' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte'
      value?: unknown
    }

export interface FilterRuleAnalysis {
  effective: boolean
  editorKind: FilterEditorKind
  project: FilterValuePreview
  query: FilterQueryAnalysis
  recordDefault?: {
    fieldId: FieldId
    value: unknown
  }
}
