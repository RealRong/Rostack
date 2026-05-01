import {
  createMutationCollabSession,
} from '@shared/collab'
import {
  createYjsCollabTransport
} from '@shared/collab-yjs'
import {
  document as documentApi
} from '@whiteboard/core/document'
import {
  isCheckpointProgram
} from '@whiteboard/core/operations'
import { createId } from '@shared/core'
import * as Y from 'yjs'
import type {
  CollabSession,
  CreateYjsSessionOptions,
  SharedChange,
  SharedCheckpoint
} from '@whiteboard/collab/types'
import { createYjsSyncCodec } from '@whiteboard/collab/yjs/codec'

const DEFAULT_CHECKPOINT_THRESHOLD = 100

const readLiveProgram = (
  program: import('@shared/mutation').MutationProgram<string>
): {
  live: import('@shared/mutation').MutationProgram<string>
  checkpointOnly: boolean
} => {
  const live = program.steps.filter((step) => (
    !isCheckpointProgram({
      steps: [step]
    })
  ))

  if (live.length === program.steps.length) {
    return {
      live: {
        steps: live
      },
      checkpointOnly: false
    }
  }
  if (live.length === 0) {
    return {
      live: {
        steps: []
      },
      checkpointOnly: program.steps.length > 0
    }
  }
  throw new Error('Collab write must be all live program steps or all checkpoint program steps.')
}

export const createYjsSession = ({
  engine,
  doc,
  actorId,
  provider,
  codec = createYjsSyncCodec(),
  checkpointThreshold = DEFAULT_CHECKPOINT_THRESHOLD
}: CreateYjsSessionOptions): CollabSession => {
  if (actorId.length === 0) {
    throw new Error('createYjsSession requires a non-empty actorId.')
  }

  const transport = createYjsCollabTransport<
    SharedChange,
    SharedCheckpoint
  >({
    doc,
    provider,
    codec
  })
  const session = createMutationCollabSession(engine, {
    actor: {
      id: actorId,
      createChangeId: () => createId('sync')
    },
    transport: {
      store: transport.store,
      provider: transport.provider
    },
    document: {
      empty: () => documentApi.create(engine.doc().id),
      checkpointEvery: checkpointThreshold,
      checkpoint: {
        create: (nextDocument) => ({
          id: createId('sync'),
          doc: nextDocument
        }),
        read: (checkpoint) => checkpoint.doc
      }
    },
    change: {
      create: (write, meta) => {
        const live = readLiveProgram(write.authored)
        if (live.checkpointOnly) {
          return null
        }

        return {
          id: meta.changeId,
          actorId: meta.actorId,
          program: live.live,
          footprint: write.footprint
        }
      },
      read: (change) => ({
        kind: 'apply',
        program: change.program
      }),
      footprint: (change) => change.footprint
    }
  })

  return {
    awareness: transport.awareness,
    status: session.status,
    diagnostics: session.diagnostics,
    localHistory: session.history,
    connect: session.connect,
    disconnect: session.disconnect,
    resync: session.resync,
    destroy: session.destroy
  }
}
