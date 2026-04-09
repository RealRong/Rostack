import type {
  BucketSort,
  Field,
  FieldId,
  RecordId,
  ViewGroup,
  ViewId
} from '@dataview/core/contracts'
import type {
  Bucket
} from '@dataview/core/field'

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

export interface ResolvedGroup extends Bucket {
  records: RecordId[]
}
