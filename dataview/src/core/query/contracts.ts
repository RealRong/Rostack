import type {
  GroupBucketSort,
  GroupProperty,
  GroupGroupBy,
  GroupViewQuery as StoredGroupViewQuery
} from '@dataview/core/contracts'

export type GroupViewQuery = StoredGroupViewQuery

export interface ResolvedViewGroupState {
  property?: GroupProperty
  propertyId: string
  mode: string
  bucketSort?: GroupBucketSort
  bucketInterval?: number
  showEmpty?: boolean
}

export type ViewGroupPatch = Pick<GroupGroupBy, 'mode' | 'bucketSort' | 'bucketInterval' | 'showEmpty'>
