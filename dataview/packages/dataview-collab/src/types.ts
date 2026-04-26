import type * as Y from 'yjs'
import type {
  CollabDiagnostics as SharedCollabDiagnostics,
  CollabProvider,
  CollabStatus
} from '@shared/collab'
import type { HistoryPort } from '@shared/mutation'
import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataviewMutationKey } from '@dataview/core/mutation'
import type { Engine } from '@dataview/engine'

export type SharedOperation = DocumentOperation

export type SharedMeta = {
  schemaVersion: 1
}

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

export type YjsSyncCodec = {
  encodeChange(change: SharedChange): Uint8Array
  decodeChange(data: Uint8Array): SharedChange
  encodeCheckpoint(checkpoint: SharedCheckpoint): Uint8Array
  decodeCheckpoint(data: Uint8Array): SharedCheckpoint
}

export type YjsSyncStore = {
  readMeta(): SharedMeta
  readCheckpoint(): SharedCheckpoint | null
  readChanges(): readonly SharedChange[]
  appendChange(change: SharedChange): void
  replaceCheckpoint(checkpoint: SharedCheckpoint): void
  clearChanges(): void
}

export type CreateYjsSessionOptions = {
  engine: Engine
  doc: Y.Doc
  actorId: string
  provider?: CollabProvider
  codec?: YjsSyncCodec
  checkpointThreshold?: number
}

export type CollabLocalHistory = HistoryPort<ReturnType<Engine['apply']>>

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
