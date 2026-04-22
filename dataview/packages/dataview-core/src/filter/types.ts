import type {
  Field,
  FieldId,
  FilterValuePreview,
  FilterOperator,
  FilterPresetId,
  FilterRule
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

export interface FilterPlanDemand {
  bucket?: true
  sorted?: true
}

export interface FilterPlanSpec {
  demandOf: (input: {
    field: Field | undefined
    rule: FilterRule
  }) => FilterPlanDemand
}

export interface FilterBucketLookup {
  mode: 'include' | 'exclude'
  keys: readonly string[]
}

export interface FilterSortLookup {
  mode: 'exists' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte'
  value?: FilterRule['value']
}

export interface FilterCandidateSpec {
  bucketLookupOf?: (input: {
    field: Field | undefined
    rule: FilterRule
  }) => FilterBucketLookup | undefined
  sortLookupOf?: (input: {
    field: Field | undefined
    rule: FilterRule
  }) => FilterSortLookup | undefined
}

export interface FilterCreateSpec {
  deriveDefaultValue?: (input: {
    field: Field
    rule: FilterRule
  }) => {
    fieldId: FieldId
    value: unknown
  } | undefined
}

export interface FilterSpec {
  presets: readonly FilterPreset[]
  getDefaultRule: (field: Field) => Omit<FilterRule, 'id'>
  getActivePreset: (field: Field | undefined, rule: FilterRule) => FilterPreset
  applyPreset: (field: Field | undefined, rule: FilterRule, presetId: FilterPresetId) => FilterRule
  getEditorKind: (field: Field | undefined, rule: FilterRule) => FilterEditorKind
  isEffective: (field: Field | undefined, rule: FilterRule) => boolean
  match: (field: Field | undefined, recordValue: unknown, rule: FilterRule) => boolean
  projectValue: (field: Field | undefined, rule: FilterRule) => FilterValuePreview
  plan: FilterPlanSpec
  candidate?: FilterCandidateSpec
  create?: FilterCreateSpec
}
