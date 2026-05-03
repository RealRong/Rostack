import type { Document } from '@whiteboard/core/types'
import type { MutationFootprint, MutationProgram } from '@shared/mutation'
import type {
  YjsSyncCodec as SharedYjsSyncCodec,
  YjsSyncStore as SharedYjsSyncStore
} from '@shared/collab-yjs'

export type SharedChange = {
  id: string
  actorId: string
  program: MutationProgram
  footprint: readonly MutationFootprint[]
}

export type SharedCheckpoint = {
  id: string
  doc: Document
}

export type YjsSyncCodec = SharedYjsSyncCodec<SharedChange, SharedCheckpoint>

export type YjsSyncStore = SharedYjsSyncStore<
  SharedChange,
  SharedCheckpoint
>
