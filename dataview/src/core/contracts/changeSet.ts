import type { PropertyId, GroupStateSlice, RecordId, ViewId } from './state'

export type GroupCommitChangedIds<T extends string = string> = readonly T[] | 'all'

export interface GroupCommitEntityChange<T extends string = string> {
  added?: readonly T[]
  updated?: GroupCommitChangedIds<T>
  removed?: readonly T[]
}

export interface GroupCommitValueChange {
  recordIds?: GroupCommitChangedIds<RecordId>
  propertyIds?: GroupCommitChangedIds<PropertyId>
}

export interface GroupCommitChangeSet {
  changedSlices: readonly GroupStateSlice[]
  records?: GroupCommitEntityChange<RecordId>
  properties?: GroupCommitEntityChange<PropertyId>
  views?: GroupCommitEntityChange<ViewId>
  values?: GroupCommitValueChange
}

export interface GroupCommitChangeSummary {
  touchesDocument: boolean
  touchesRecords: boolean
  touchesProperties: boolean
  touchesViews: boolean
  touchesValues: boolean
}
