import { store as coreStore } from '@shared/core'
import {
  collab as mutationCollab,
  type CollabStore
} from '@shared/mutation'
import { document as documentApi } from '@whiteboard/core/document'
import { META as operationMeta } from '@whiteboard/core/spec/operation'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import { createId } from '@whiteboard/core/id'
import * as Y from 'yjs'
import { createLocalHistoryController } from '@whiteboard/collab/localHistory'
import type {
  CollabDiagnostics,
  CollabSession,
  CollabStatus,
  CreateYjsSessionOptions,
  SharedChange,
  SharedCheckpoint
} from '@whiteboard/collab/types'
import { createYjsSyncCodec } from '@whiteboard/collab/yjs/codec'
import { createYjsSyncStore } from '@whiteboard/collab/yjs/store'
import { createCollabLocalOrigin } from '@whiteboard/collab/yjs/shared'

const DEFAULT_CHECKPOINT_THRESHOLD = 100

const toEngineOrigin = (
  origin?: import('@shared/mutation').Origin
): import('@whiteboard/core/types').Origin | undefined => {
  switch (origin) {
    case 'remote':
    case 'system':
    case 'user':
      return origin
    default:
      return 'system'
  }
}

const createSharedStore = (input: {
  doc: Y.Doc
  localOrigin: unknown
  syncStore: ReturnType<typeof createYjsSyncStore>
  onRead?: (snapshot: ReturnType<ReturnType<typeof createYjsSyncStore>['readSnapshot']>) => void
}): CollabStore<Document, Operation, SharedChange['footprint'][number]> => ({
  read: () => {
    input.syncStore.readMeta()
    const snapshot = input.syncStore.readSnapshot()
    input.onRead?.(snapshot)
    return {
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes
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
      input.syncStore.appendChange(change as SharedChange)
    }, input.localOrigin)
  },
  checkpoint: (checkpoint) => {
    input.doc.transact(() => {
      input.syncStore.replaceCheckpoint(checkpoint as SharedCheckpoint)
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

  const status = coreStore.createValueStore<CollabStatus>('idle')
  const diagnostics = coreStore.createValueStore<CollabDiagnostics>({
    duplicateChangeIds: [],
    rejectedChangeIds: []
  })
  const syncStore = createYjsSyncStore({
    doc,
    codec
  })
  const localOrigin = createCollabLocalOrigin()
  const localHistoryController = createLocalHistoryController({
    engine,
    canApply: () => bootstrapped && !destroyed
  })

  let destroyed = false
  let bootstrapped = false
  let waitingForProviderSync = false
  let unsubscribeProviderSync: (() => void) | undefined

  const duplicateChangeIds = new Set<string>()
  const rejectedChangeIds = new Set<string>()

  const publishDiagnostics = () => {
    diagnostics.set({
      duplicateChangeIds: [...duplicateChangeIds],
      rejectedChangeIds: [...rejectedChangeIds]
    })
  }

  const trackDuplicates = (
    ids: readonly string[]
  ) => {
    let changed = false
    ids.forEach((id) => {
      if (!duplicateChangeIds.has(id)) {
        duplicateChangeIds.add(id)
        changed = true
      }
    })
    if (changed) {
      publishDiagnostics()
    }
  }

  const trackRejected = (
    id: string
  ) => {
    if (rejectedChangeIds.has(id)) {
      return
    }
    rejectedChangeIds.add(id)
    publishDiagnostics()
  }

  const reportError = () => {
    status.set('error')
  }

  const sharedStore = createSharedStore({
    doc,
    localOrigin,
    syncStore,
    onRead: (snapshot) => {
      trackDuplicates(snapshot.duplicateChangeIds)
    }
  })

  const coreSession = mutationCollab.create<
    Document,
    Operation,
    SharedChange['footprint'][number],
    import('@whiteboard/engine').EngineWrite
  >({
    actorId,
    engine: {
      doc: () => engine.current().snapshot.state.root,
      replace: (nextDocument, options) => engine.execute({
        type: 'document.replace',
        document: nextDocument
      }, {
        origin: toEngineOrigin(options?.origin)
      }).ok,
      apply: (ops, options) => engine.apply(ops, {
        origin: toEngineOrigin(options?.origin)
      }).ok,
      writes: engine.writes
    },
    store: sharedStore,
    meta: operationMeta,
    history: localHistoryController.controller,
    empty: () => documentApi.create(engine.current().snapshot.state.root.id),
    createId: () => createId('sync'),
    checkpointEvery: checkpointThreshold,
    onReject: (change) => {
      trackRejected(change.id)
    },
    onError: () => {
      reportError()
    }
  })

  const safeStart = () => {
    try {
      status.set('bootstrapping')
      coreSession.start()
      bootstrapped = true
      status.set('connected')
    } catch {
      reportError()
    }
  }

  const maybeWaitForProviderSync = (
    onReady: () => void
  ) => {
    const synced = provider?.isSynced?.()
    if (synced === true) {
      onReady()
      return
    }

    if (!provider?.subscribeSync) {
      onReady()
      return
    }

    waitingForProviderSync = true
    status.set('connecting')
    unsubscribeProviderSync?.()
    unsubscribeProviderSync = provider.subscribeSync((nextSynced) => {
      if (!nextSynced || destroyed) {
        return
      }
      waitingForProviderSync = false
      unsubscribeProviderSync?.()
      unsubscribeProviderSync = undefined
      onReady()
    })
  }

  const connect = () => {
    if (destroyed) {
      return
    }

    provider?.connect?.()

    if (bootstrapped) {
      status.set('connected')
      return
    }

    maybeWaitForProviderSync(safeStart)
  }

  const disconnect = () => {
    if (destroyed) {
      return
    }

    provider?.disconnect?.()
    if (waitingForProviderSync) {
      unsubscribeProviderSync?.()
      unsubscribeProviderSync = undefined
      waitingForProviderSync = false
    }
    status.set('disconnected')
  }

  const resync = () => {
    if (destroyed) {
      return
    }

    if (waitingForProviderSync) {
      unsubscribeProviderSync?.()
      unsubscribeProviderSync = undefined
      waitingForProviderSync = false
    }

    const runResync = () => {
      try {
        status.set('bootstrapping')
        if (!bootstrapped) {
          coreSession.start()
        } else {
          coreSession.resync()
        }
        bootstrapped = true
        status.set('connected')
      } catch {
        reportError()
      }
    }

    maybeWaitForProviderSync(runResync)
  }

  const destroy = () => {
    if (destroyed) {
      return
    }
    destroyed = true
    unsubscribeProviderSync?.()
    unsubscribeProviderSync = undefined
    provider?.destroy?.()
    coreSession.stop()
    waitingForProviderSync = false
    status.set('disconnected')
  }

  return {
    awareness: provider?.awareness,
    status,
    diagnostics,
    localHistory: localHistoryController.localHistory,
    connect,
    disconnect,
    resync,
    destroy
  }
}
