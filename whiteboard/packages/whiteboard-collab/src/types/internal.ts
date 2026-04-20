import type { SharedChange, SharedCheckpoint } from '@whiteboard/collab/types/shared'

export type SyncCursor = {
  checkpointId: string | null
  changeIds: readonly string[]
}

export type YjsSyncSnapshot = {
  checkpoint: SharedCheckpoint | null
  changes: readonly SharedChange[]
  duplicateChangeIds: readonly string[]
}

export type ReplayPlan =
  | {
      kind: 'append'
      changes: readonly SharedChange[]
    }
  | {
      kind: 'reset'
      checkpoint: SharedCheckpoint | null
      changes: readonly SharedChange[]
    }
