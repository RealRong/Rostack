export interface CommitHistoryDepth {
  undoDepth: number
  redoDepth: number
}

export type {
  CommitDelta,
  DeltaEntities,
  DeltaEntityIds,
  DeltaIds,
  DeltaItem,
  DeltaSummary,
  DeltaValueIds
} from '@dataview/core/contracts/delta'

export interface HistoryState extends CommitHistoryDepth {
  capacity: number
}

export interface HistoryOptions {
  capacity?: number
}
