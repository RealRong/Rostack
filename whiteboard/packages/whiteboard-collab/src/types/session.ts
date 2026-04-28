import { store as coreStore } from '@shared/core'
import type {
  HistoryPort,
  MutationFootprint
} from '@shared/mutation'
import type { Engine } from '@whiteboard/engine'
import type { IntentResult } from '@whiteboard/engine'
import type { Operation } from '@whiteboard/core/types'
import type { EngineApplyCommit } from '@whiteboard/engine'
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

export type CollabLocalHistory = HistoryPort<
  IntentResult,
  Operation,
  MutationFootprint,
  EngineApplyCommit
>

export type CollabSession = {
  awareness?: unknown
  status: coreStore.ReadStore<CollabStatus>
  diagnostics: coreStore.ReadStore<CollabDiagnostics>
  localHistory: CollabLocalHistory
  connect: () => void
  disconnect: () => void
  resync: () => void
  destroy: () => void
}
