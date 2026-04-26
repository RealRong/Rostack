import * as Y from 'yjs'
import { createId } from '@shared/core'
import {
  createMutationCollabSession,
} from '@shared/collab'
import {
  createYjsCollabTransport
} from '@shared/collab-yjs'
import { document as documentApi } from '@dataview/core/document'
import type { DataDoc } from '@dataview/core/contracts'
import { createYjsSyncCodec } from '@dataview/collab/yjs/codec'
import type {
  CollabSession,
  CreateYjsSessionOptions,
  SharedChange,
  SharedCheckpoint
} from '@dataview/collab/types'

const DEFAULT_CHECKPOINT_THRESHOLD = 100

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
  const session = createMutationCollabSession(engine.mutation, {
    actor: {
      id: actorId,
      createChangeId: () => createId('sync')
    },
    transport: {
      store: transport.store,
      provider: transport.provider
    },
    document: {
      empty: () => documentApi.normalize({
        schemaVersion: engine.doc().schemaVersion,
        activeViewId: undefined,
        fields: {
          byId: {},
          order: []
        },
        views: {
          byId: {},
          order: []
        },
        records: {
          byId: {},
          order: []
        },
        meta: {}
      }),
      checkpointEvery: checkpointThreshold,
      checkpoint: {
        create: (nextDocument: DataDoc) => ({
          id: createId('sync'),
          doc: documentApi.clone(nextDocument)
        }),
        read: (checkpoint) => documentApi.clone(checkpoint.doc)
      }
    },
    change: {
      create: (write, meta) => ({
        id: meta.changeId,
        actorId: meta.actorId,
        ops: write.forward,
        footprint: write.footprint
      }),
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
