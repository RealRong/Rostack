import type {
  BucketSort,
  Field,
  Filter,
  Search,
  Sorter,
  ViewGroup,
  ViewQuery as StoredGroupViewQuery
} from '@dataview/core/contracts/state'

export interface ViewQuery {
  search: Search
  filter: Filter
  sort: Sorter[]
  group?: ViewGroup
}

export type StoredViewQuery = StoredGroupViewQuery

export interface ResolvedViewGroupState {
  field?: Field
  fieldId: string
  mode: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty?: boolean
}

export type ViewGroupPatch = Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval' | 'showEmpty'>
