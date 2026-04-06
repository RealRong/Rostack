export interface CommitHistoryDepth {
  undoDepth: number
  redoDepth: number
}

export type {
  CommitChangedIds,
  CommitEntityChange,
  CommitValueChange,
  CommitChangeSet,
  CommitChangeSummary
} from '@dataview/core/contracts/changeSet'

export interface HistoryState extends CommitHistoryDepth {
  capacity: number
}

export interface HistoryOptions {
  capacity?: number
}
