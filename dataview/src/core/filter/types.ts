import type {
  Field,
  FieldId,
  FilterOperator,
  FilterPresetId,
  FilterRule,
  ViewId
} from '@dataview/core/contracts'

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

export interface FilterConditionProjection {
  id: FilterPresetId
  selected: boolean
}

export interface FilterRuleProjection {
  rule: FilterRule
  fieldId: FieldId
  field?: Field
  fieldLabel: string
  activePresetId: FilterPresetId
  effective: boolean
  editorKind: FilterEditorKind
  valueText: string
  bodyLayout: 'none' | 'inset' | 'flush'
  conditions: readonly FilterConditionProjection[]
}

export interface ViewFilterProjection {
  viewId: ViewId
  mode: 'and' | 'or'
  rules: readonly FilterRuleProjection[]
}

export interface FilterSpec {
  presets: readonly FilterPreset[]
  getDefaultRule: (field: Field) => FilterRule
  getActivePreset: (field: Field | undefined, rule: FilterRule) => FilterPreset
  applyPreset: (field: Field | undefined, rule: FilterRule, presetId: FilterPresetId) => FilterRule
  getEditorKind: (field: Field | undefined, rule: FilterRule) => FilterEditorKind
  isEffective: (field: Field | undefined, rule: FilterRule) => boolean
  match: (field: Field | undefined, recordValue: unknown, rule: FilterRule) => boolean
  formatValueText: (field: Field | undefined, rule: FilterRule) => string
}
