export interface GroupCommitHistoryDepth {
  undoDepth: number
  redoDepth: number
}

export type {
  GroupCommitChangedIds,
  GroupCommitEntityChange,
  GroupCommitValueChange,
  GroupCommitChangeSet,
  GroupCommitChangeSummary
} from '@dataview/core/contracts/changeSet'

export interface GroupHistoryState extends GroupCommitHistoryDepth {
  capacity: number
}

export interface GroupHistoryOptions {
  capacity?: number
}
