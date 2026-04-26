import * as Y from 'yjs'
import { createId } from '@shared/core'
import {
  createMutationCollabSession,
  type CollabStore
} from '@shared/collab'
import { readHistoryController } from '@shared/mutation'
import { document as documentApi } from '@dataview/core/document'
import type { DataDoc } from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { DataviewMutationKey } from '@dataview/core/mutation'
import { createYjsSyncCodec } from '@dataview/collab/yjs/codec'
import { createYjsSyncStore } from '@dataview/collab/yjs/store'
import { createCollabLocalOrigin } from '@dataview/collab/yjs/shared'
import type {
  CollabSession,
  CreateYjsSessionOptions,
  SharedChange,
  SharedCheckpoint
} from '@dataview/collab/types'
import type { EngineWrite } from '@dataview/engine/contracts/write'

const DEFAULT_CHECKPOINT_THRESHOLD = 100

const createSharedStore = (input: {
  doc: Y.Doc
  localOrigin: unknown
  syncStore: ReturnType<typeof createYjsSyncStore>
}): CollabStore<SharedChange, SharedCheckpoint> => ({
  read: () => {
    input.syncStore.readMeta()
    const snapshot = input.syncStore.readSnapshot()
    return {
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes,
      duplicateChangeIds: snapshot.duplicateChangeIds
    }
  },
  subscribe: (listener) => {
    const handleAfterTransaction = (transaction: Y.Transaction) => {
      if (transaction.origin === input.localOrigin) {
        return
      }
      listener()
    }
    input.doc.on('afterTransaction', handleAfterTransaction)
    return () => {
      input.doc.off('afterTransaction', handleAfterTransaction)
    }
  },
  append: (change) => {
    input.doc.transact(() => {
      input.syncStore.appendChange(change)
    }, input.localOrigin)
  },
  checkpoint: (checkpoint) => {
    input.doc.transact(() => {
      input.syncStore.replaceCheckpoint(checkpoint)
    }, input.localOrigin)
  },
  clearChanges: () => {
    input.doc.transact(() => {
      input.syncStore.clearChanges()
    }, input.localOrigin)
  }
})

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

  const syncStore = createYjsSyncStore({
    doc,
    codec
  })
  const localOrigin = createCollabLocalOrigin()
  const sharedStore = createSharedStore({
    doc,
    localOrigin,
    syncStore
  })
  const historyController = readHistoryController<
    DocumentOperation,
    DataviewMutationKey,
    EngineWrite
  >(engine)
  const session = createMutationCollabSession({
    doc: () => engine.doc(),
    replace: (nextDocument, options) => engine.replace(nextDocument, options),
    apply: (operations, options) => engine.apply(operations, options),
    commits: engine.commits,
    history: historyController
  }, {
    actor: {
      id: actorId,
      createChangeId: () => createId('sync')
    },
    transport: {
      store: sharedStore,
      provider
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
    awareness: provider?.awareness,
    status: session.status,
    diagnostics: session.diagnostics,
    localHistory: session.history,
    connect: session.connect,
    disconnect: session.disconnect,
    resync: session.resync,
    destroy: session.destroy
  }
}
