import type { Document, Operation } from '@whiteboard/core/types'
import type { MutationFootprint } from '@shared/mutation'
import type {
  YjsSyncCodec as SharedYjsSyncCodec,
  YjsSyncMeta,
  YjsSyncStore as SharedYjsSyncStore
} from '@shared/collab-yjs'

export type SharedOperation = Exclude<Operation, { type: 'document.create' }>

export type SharedMeta = YjsSyncMeta<1>

export type SharedChange = {
  id: string
  actorId: string
  ops: readonly SharedOperation[]
  footprint: readonly MutationFootprint[]
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
