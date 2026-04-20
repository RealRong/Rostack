import type { ReadStore } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type * as Y from 'yjs'
import type {
  CollabProvider,
  CollabStatus
} from '@whiteboard/collab/types/provider'
import type { YjsSyncCodec } from '@whiteboard/collab/types/shared'

export type CreateYjsSessionOptions = {
  engine: Engine
  doc: Y.Doc
  actorId: string
  provider?: CollabProvider
  codec?: YjsSyncCodec
  checkpointThreshold?: number
}

export type CollabDiagnostics = {
  duplicateChangeIds: readonly string[]
  rejectedChangeIds: readonly string[]
}

export type CollabLocalHistoryState = {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
  lastUpdatedAt?: number
}

export type CollabLocalHistory = ReadStore<CollabLocalHistoryState> & {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type CollabSession = {
  awareness?: unknown
  status: ReadStore<CollabStatus>
  diagnostics: ReadStore<CollabDiagnostics>
  localHistory: CollabLocalHistory
  connect: () => void
  disconnect: () => void
  resync: () => void
  destroy: () => void
}
