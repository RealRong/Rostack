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
  isCheckpointOperation
} from '@whiteboard/core/operations'
import type {
  Operation
} from '@whiteboard/core/types'
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

const readLiveOperations = (
  operations: readonly Operation[]
): {
  live: readonly Exclude<Operation, { type: 'document.create' }>[]
  checkpointOnly: boolean
} => {
  const live = operations.filter((operation) => (
    !isCheckpointOperation(operation)
  )) as readonly Exclude<Operation, { type: 'document.create' }>[]

  if (live.length === operations.length) {
    return {
      live,
      checkpointOnly: false
    }
  }
  if (live.length === 0) {
    return {
      live,
      checkpointOnly: operations.length > 0
    }
  }
  throw new Error('Collab write must be all live operations or all checkpoint operations.')
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
        const live = readLiveOperations(write.forward)
        if (live.checkpointOnly) {
          return null
        }

        return {
          id: meta.changeId,
          actorId: meta.actorId,
          ops: live.live,
          footprint: write.footprint
        }
      },
      read: (change) => ({
        kind: 'apply',
        operations: change.ops
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
