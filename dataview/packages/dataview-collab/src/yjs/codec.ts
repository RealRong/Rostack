import { document as documentApi } from '@dataview/core/document'
import {
  decodeJsonBytes,
  encodeJsonBytes
} from '@shared/collab-yjs'
import {
  assertMutationFootprintList
} from '@shared/mutation/write'
import type { DataDoc } from '@dataview/core/types'
import {
  isMutationProgramStep,
  type MutationProgram
} from '@shared/mutation'
import type {
  SharedChange,
  SharedCheckpoint,
  YjsSyncCodec
} from '@dataview/collab/types'

const isRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const assertSharedProgram = (
  value: unknown
): MutationProgram => {
  if (
    !isRecord(value)
    || !Array.isArray(value.steps)
  ) {
    throw new Error('Shared change program is invalid.')
  }

  value.steps.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.type !== 'string' || !isMutationProgramStep(entry as { type: string })) {
      throw new Error('Shared change program step is invalid.')
    }
  })

  return {
    steps: value.steps as MutationProgram['steps']
  }
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
    program: assertSharedProgram(value.program),
    footprint: assertMutationFootprintList(value.footprint)
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
  encodeChange: (change) => encodeJsonBytes(change),
  decodeChange: (data) => assertSharedChange(decodeJsonBytes(data)),
  encodeCheckpoint: (checkpoint) => encodeJsonBytes(checkpoint),
  decodeCheckpoint: (data) => assertSharedCheckpoint(decodeJsonBytes(data))
})
