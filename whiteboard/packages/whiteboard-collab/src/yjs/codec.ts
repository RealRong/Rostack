import { document as documentApi } from '@whiteboard/core/document'
import { META } from '@whiteboard/core/spec/operation'
import { assertHistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  SharedChange,
  SharedCheckpoint,
  SharedOperation,
  YjsSyncCodec
} from '@whiteboard/collab/types/shared'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const isRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const encodeJson = (
  value: unknown
): Uint8Array => encoder.encode(JSON.stringify(value))

const decodeJson = (
  data: Uint8Array
): unknown => JSON.parse(decoder.decode(data))

const assertSharedOperations = (
  value: unknown
): readonly SharedOperation[] => {
  if (!Array.isArray(value)) {
    throw new Error('Shared change operations must be an array.')
  }

  value.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.type !== 'string') {
      throw new Error('Shared change operation is invalid.')
    }
    if (
      !(entry.type in META)
      || META[entry.type as SharedOperation['type']].sync === 'checkpoint'
    ) {
      throw new Error('document.replace cannot appear in shared change log.')
    }
  })

  return value as readonly SharedOperation[]
}

const assertSharedChange = (
  value: unknown
): SharedChange => {
  if (!isRecord(value)) {
    throw new Error('Shared change must be an object.')
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error('Shared change id is required.')
  }
  if (typeof value.actorId !== 'string' || value.actorId.length === 0) {
    throw new Error('Shared change actorId is required.')
  }

  return {
    id: value.id,
    actorId: value.actorId,
    ops: assertSharedOperations(value.ops),
    footprint: assertHistoryFootprint(value.footprint)
  }
}

const assertSharedCheckpoint = (
  value: unknown
): SharedCheckpoint => {
  if (!isRecord(value)) {
    throw new Error('Shared checkpoint must be an object.')
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error('Shared checkpoint id is required.')
  }

  return {
    id: value.id,
    doc: documentApi.assert(value.doc as import('@whiteboard/core/types').Document)
  }
}

export const createYjsSyncCodec = (): YjsSyncCodec => ({
  encodeChange: (change) => encodeJson(change),
  decodeChange: (data) => assertSharedChange(decodeJson(data)),
  encodeCheckpoint: (checkpoint) => encodeJson(checkpoint),
  decodeCheckpoint: (data) => assertSharedCheckpoint(decodeJson(data))
})
