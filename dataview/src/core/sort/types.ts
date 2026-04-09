import type {
  Field,
  FieldId,
  Sorter,
  ViewId
} from '@dataview/core/contracts'

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
