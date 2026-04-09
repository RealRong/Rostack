import type {
  FieldId,
  Search,
  ViewId
} from '@dataview/core/contracts'

export interface ViewSearchProjection {
  viewId: ViewId
  search: Search
  query: string
  fields?: readonly FieldId[]
  active: boolean
}
