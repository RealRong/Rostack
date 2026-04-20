import type { Document, Operation } from '@whiteboard/core/types'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'

export type SharedOperation = Exclude<Operation, { type: 'document.replace' }>

export type SharedMeta = {
  schemaVersion: 1
}

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

export type YjsSyncCodec = {
  encodeChange: (change: SharedChange) => Uint8Array
  decodeChange: (data: Uint8Array) => SharedChange
  encodeCheckpoint: (checkpoint: SharedCheckpoint) => Uint8Array
  decodeCheckpoint: (data: Uint8Array) => SharedCheckpoint
}

export type YjsSyncStore = {
  readMeta: () => SharedMeta
  readCheckpoint: () => SharedCheckpoint | null
  readChanges: () => readonly SharedChange[]
  appendChange: (change: SharedChange) => void
  replaceCheckpoint: (checkpoint: SharedCheckpoint) => void
  clearChanges: () => void
}
