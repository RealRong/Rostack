import type {
  BucketSort,
  Field,
  Grouping,
  ViewQuery as StoredGroupViewQuery
} from '@dataview/core/contracts'

export type ViewQuery = StoredGroupViewQuery

export interface ResolvedViewGroupState {
  field?: Field
  fieldId: string
  mode: string
  bucketSort?: BucketSort
  bucketInterval?: number
  showEmpty?: boolean
}

export type ViewGroupPatch = Pick<Grouping, 'mode' | 'bucketSort' | 'bucketInterval' | 'showEmpty'>
