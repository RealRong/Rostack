import type { CustomFieldId, StateSlice, RecordId, ViewId } from './state'

export type CommitChangedIds<T extends string = string> = readonly T[] | 'all'

export interface CommitEntityChange<T extends string = string> {
  added?: readonly T[]
  updated?: CommitChangedIds<T>
  removed?: readonly T[]
}

export interface CommitValueChange {
  recordIds?: CommitChangedIds<RecordId>
  fieldIds?: CommitChangedIds<CustomFieldId>
}

export interface CommitChangeSet {
  changedSlices: readonly StateSlice[]
  records?: CommitEntityChange<RecordId>
  fields?: CommitEntityChange<CustomFieldId>
  views?: CommitEntityChange<ViewId>
  values?: CommitValueChange
}

export interface CommitChangeSummary {
  touchesDocument: boolean
  touchesRecords: boolean
  touchesFields: boolean
  touchesViews: boolean
  touchesValues: boolean
}
