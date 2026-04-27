import type * as Y from 'yjs'
import type {
  CollabDiagnostics as SharedCollabDiagnostics,
  CollabProvider,
  CollabStatus
} from '@shared/collab'
import type {
  YjsSyncCodec as SharedYjsSyncCodec,
  YjsSyncMeta,
  YjsSyncStore as SharedYjsSyncStore
} from '@shared/collab-yjs'
import type { HistoryPort } from '@shared/mutation'
import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataviewMutationKey } from '@dataview/core/mutation'
import type { Engine } from '@dataview/engine'
import type { EngineApplyCommit } from '@dataview/engine/contracts/write'

export type SharedOperation = DocumentOperation

export type SharedMeta = YjsSyncMeta<1>

export type SharedChange = {
  id: string
  actorId: string
  ops: readonly SharedOperation[]
  footprint: readonly DataviewMutationKey[]
}

export type SharedCheckpoint = {
  id: string
  doc: DataDoc
}

export type YjsSyncCodec = SharedYjsSyncCodec<SharedChange, SharedCheckpoint>

export type YjsSyncStore = SharedYjsSyncStore<
  SharedChange,
  SharedCheckpoint,
  SharedMeta
>

export type CreateYjsSessionOptions = {
  engine: Engine
  doc: Y.Doc
  actorId: string
  provider?: CollabProvider
  codec?: YjsSyncCodec
  checkpointThreshold?: number
}

export type CollabLocalHistory = HistoryPort<
  ReturnType<Engine['apply']>,
  DocumentOperation,
  DataviewMutationKey,
  EngineApplyCommit
>

export type CollabDiagnostics = SharedCollabDiagnostics

export type CollabSession = {
  awareness?: unknown
  status: {
    get(): CollabStatus
    subscribe(listener: () => void): () => void
  }
  diagnostics: {
    get(): CollabDiagnostics
    subscribe(listener: () => void): () => void
  }
  localHistory: CollabLocalHistory
  connect(): void
  disconnect(): void
  resync(): void
  destroy(): void
}

export type {
  CollabProvider,
  CollabStatus
}
