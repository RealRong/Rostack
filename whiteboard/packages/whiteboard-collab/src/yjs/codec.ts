import { document as documentApi } from '@whiteboard/core/document'
import {
  decodeJsonBytes,
  encodeJsonBytes
} from '@shared/collab-yjs'
import {
  assertMutationFootprintList
} from '@shared/mutation'
import {
  isMutationProgramStep,
  type MutationProgram
} from '@shared/mutation'
import {
  isCheckpointProgram
} from '@whiteboard/core/operations'
import type {
  SharedChange,
  SharedCheckpoint,
  YjsSyncCodec
} from '@whiteboard/collab/types/shared'

const isRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const assertSharedProgram = (
  value: unknown
): MutationProgram<string> => {
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

  const program = {
    steps: value.steps as MutationProgram<string>['steps']
  }
  if (isCheckpointProgram(program)) {
    throw new Error('document.create cannot appear in shared change log.')
  }

  return program
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
  encodeChange: (change) => encodeJsonBytes(change),
  decodeChange: (data) => assertSharedChange(decodeJsonBytes(data)),
  encodeCheckpoint: (checkpoint) => encodeJsonBytes(checkpoint),
  decodeCheckpoint: (data) => assertSharedCheckpoint(decodeJsonBytes(data))
})
