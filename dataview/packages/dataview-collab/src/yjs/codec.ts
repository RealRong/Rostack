import { document as documentApi } from '@dataview/core/document'
import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type {
  SharedChange,
  SharedCheckpoint,
  SharedOperation,
  YjsSyncCodec
} from '@dataview/collab/types'

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
  })

  return value as readonly DocumentOperation[]
}

const assertSharedFootprint = (
  value: unknown
): SharedChange['footprint'] => {
  if (!Array.isArray(value)) {
    throw new Error('Shared change footprint must be an array.')
  }

  value.forEach((entry) => {
    if (!Array.isArray(entry)) {
      throw new Error('Shared change footprint entry must be a path.')
    }
  })

  return value as SharedChange['footprint']
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
    footprint: assertSharedFootprint(value.footprint)
  }
}

const assertCheckpointDoc = (
  value: unknown
): DataDoc => documentApi.normalize(
  documentApi.clone(value as DataDoc)
)

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
    doc: assertCheckpointDoc(value.doc)
  }
}

export const createYjsSyncCodec = (): YjsSyncCodec => ({
  encodeChange: (change) => encodeJson(change),
  decodeChange: (data) => assertSharedChange(decodeJson(data)),
  encodeCheckpoint: (checkpoint) => encodeJson(checkpoint),
  decodeCheckpoint: (data) => assertSharedCheckpoint(decodeJson(data))
})
