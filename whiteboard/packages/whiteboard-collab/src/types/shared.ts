import type { Document, Operation } from '@whiteboard/core/types'
import type { HistoryFootprint } from '@whiteboard/core/operations'
import type {
  YjsSyncCodec as SharedYjsSyncCodec,
  YjsSyncMeta,
  YjsSyncStore as SharedYjsSyncStore
} from '@shared/collab-yjs'

export type SharedOperation = Exclude<Operation, { type: 'document.replace' }>

export type SharedMeta = YjsSyncMeta<1>

export type SharedChange = {
  id: string
  actorId: string
  ops: readonly SharedOperation[]
  footprint: HistoryFootprint
}

export type SharedCheckpoint = {
  id: string
  doc: Document
}

export type YjsSyncCodec = SharedYjsSyncCodec<SharedChange, SharedCheckpoint>

export type YjsSyncStore = SharedYjsSyncStore<
  SharedChange,
  SharedCheckpoint,
  SharedMeta
>
