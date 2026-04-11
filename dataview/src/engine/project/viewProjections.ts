import type {
  BucketSort,
  Field,
  FieldId,
  FilterPresetId,
  FilterRule,
  Search,
  Sorter,
  ViewGroup,
  ViewId
} from '@dataview/core/contracts'
import type { FilterEditorKind } from '@dataview/core/filter'

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

export interface ViewGroupProjection {
  viewId: ViewId
  group?: ViewGroup
  active: boolean
  fieldId: FieldId | ''
  field?: Field
  fieldLabel: string
  mode: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty: boolean
  availableModes: readonly string[]
  availableBucketSorts: readonly BucketSort[]
  supportsInterval: boolean
}

export interface ViewSearchProjection {
  viewId: ViewId
  search: Search
  query: string
  fields?: readonly FieldId[]
  active: boolean
}

export interface SortRuleProjection {
  sorter: Sorter
  fieldId: FieldId
  field?: Field
  fieldLabel: string
}

export interface ViewSortProjection {
  viewId: ViewId
  active: boolean
  rules: readonly SortRuleProjection[]
}
