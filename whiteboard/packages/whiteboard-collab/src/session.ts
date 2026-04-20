import { createValueStore } from '@shared/core'
import { createDocument } from '@whiteboard/core/document'
import { createId } from '@whiteboard/core/id'
import { sync } from '@whiteboard/core/spec/operation'
import type { EngineWrite } from '@whiteboard/engine'
import * as Y from 'yjs'
import { createLocalHistoryController } from '@whiteboard/collab/localHistory'
import {
  createSyncCursor,
  planReplay
} from '@whiteboard/collab/replay'
import type {
  CollabDiagnostics,
  CollabSession,
  CollabStatus,
  CreateYjsSessionOptions,
  SharedChange,
  SharedCheckpoint
} from '@whiteboard/collab/types'
import type {
  SyncCursor,
  YjsSyncSnapshot
} from '@whiteboard/collab/types/internal'
import { createYjsSyncCodec } from '@whiteboard/collab/yjs/codec'
import { createYjsSyncStore } from '@whiteboard/collab/yjs/store'
import { createCollabLocalOrigin } from '@whiteboard/collab/yjs/shared'

const DEFAULT_CHECKPOINT_THRESHOLD = 100

const createCheckpoint = (
  doc: import('@whiteboard/core/types').Document
): SharedCheckpoint => ({
  id: createId('checkpoint'),
  doc
})

const toSharedOperations = (
  operations: readonly import('@whiteboard/core/types').Operation[]
): readonly SharedChange['ops'][number][] | null => {
  const shared = operations.filter((op) => sync.isLive(op))
  return shared.length === operations.length
    ? shared as readonly SharedChange['ops'][number][]
    : null
}

const createSharedChange = (
  actorId: string,
  write: EngineWrite
): SharedChange | null => {
  const ops = toSharedOperations(write.forward)
  if (!ops || ops.length === 0) {
    return null
  }
  return {
    id: createId('change'),
    actorId,
    ops,
    footprint: write.footprint
  }
}

const isCheckpointWrite = (
  write: EngineWrite
): boolean => write.forward.some((op) => sync.isCheckpointOnly(op))

const createEmptyReplayDocument = (
  engine: CreateYjsSessionOptions['engine']
) => createDocument(engine.document.get().id)

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

  const status = createValueStore<CollabStatus>('idle')
  const diagnostics = createValueStore<CollabDiagnostics>({
    duplicateChangeIds: [],
    rejectedChangeIds: []
  })
  const store = createYjsSyncStore({
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
  let suppressLocalPublish = false
  let rotatingCheckpoint = false
  let lastWrite: EngineWrite | null = null
  let cursor: SyncCursor = {
    checkpointId: null,
    changeIds: []
  }
  let unsubscribeProviderSync: (() => void) | undefined

  const duplicateChangeIds = new Set<string>()
  const rejectedChangeIds = new Set<string>()
  const localChangeIds = new Set<string>()

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

  const syncCursor = (
    snapshot: YjsSyncSnapshot
  ) => {
    cursor = createSyncCursor(snapshot)
  }

  const readSnapshot = (): YjsSyncSnapshot => {
    store.readMeta()
    const snapshot = store.readSnapshot()
    trackDuplicates(snapshot.duplicateChangeIds)
    return snapshot
  }

  const reportError = () => {
    status.set('error')
  }

  const replayChanges = (
    changes: readonly SharedChange[]
  ) => {
    changes.forEach((change) => {
      if (!localChangeIds.has(change.id)) {
        localHistoryController.observeRemoteChange(change)
      }
      try {
        const result = engine.apply(change.ops, {
          origin: 'remote'
        })
        if (result.ok) {
          return
        }
      } catch {
        trackRejected(change.id)
        return
      }
      trackRejected(change.id)
    })
  }

  const consumeSnapshot = ({
    forceReset = false,
    allowRotate = false
  }: {
    forceReset?: boolean
    allowRotate?: boolean
  } = {}) => {
    const snapshot = readSnapshot()
    const plan = planReplay({
      cursor,
      snapshot,
      forceReset
    })

    if (plan.kind === 'append') {
      if (plan.changes.length > 0) {
        suppressLocalPublish = true
        try {
          replayChanges(plan.changes)
        } finally {
          suppressLocalPublish = false
        }
      }
      syncCursor(snapshot)
    } else {
      suppressLocalPublish = true
      try {
        const baseDocument = plan.checkpoint?.doc ?? createEmptyReplayDocument(engine)
        const replaceResult = engine.execute({
          type: 'document.replace',
          document: baseDocument
        }, {
          origin: 'remote'
        })
        if (!replaceResult.ok) {
          throw new Error(replaceResult.error.message)
        }
        replayChanges(plan.changes)
      } finally {
        suppressLocalPublish = false
      }
      syncCursor(snapshot)
    }

    if (allowRotate) {
      maybeRotateCheckpoint()
    }
  }

  const publishCheckpoint = (
    nextDocument: import('@whiteboard/core/types').Document
  ) => {
    doc.transact(() => {
      store.replaceCheckpoint(createCheckpoint(nextDocument))
      store.clearChanges()
    }, localOrigin)

    const snapshot = readSnapshot()
    if (snapshot.changes.length === 0) {
      syncCursor(snapshot)
      return
    }

    consumeSnapshot({
      forceReset: true,
      allowRotate: false
    })
  }

  const maybeRotateCheckpoint = () => {
    if (rotatingCheckpoint || checkpointThreshold <= 0) {
      return
    }

    const snapshot = readSnapshot()
    if (snapshot.changes.length < checkpointThreshold) {
      return
    }

    rotatingCheckpoint = true
    try {
      doc.transact(() => {
        store.replaceCheckpoint(createCheckpoint(engine.document.get()))
        store.clearChanges()
      }, localOrigin)

      const snapshot = readSnapshot()
      if (snapshot.changes.length === 0) {
        syncCursor(snapshot)
        return
      }

      consumeSnapshot({
        forceReset: true,
        allowRotate: false
      })
    } finally {
      rotatingCheckpoint = false
    }
  }

  const publishWrite = (
    write: EngineWrite
  ) => {
    if (write.origin === 'remote' || suppressLocalPublish) {
      return
    }

    if (isCheckpointWrite(write)) {
      publishCheckpoint(engine.document.get())
      localHistoryController.clear()
      return
    }

    if (write.forward.length === 0) {
      return
    }

    const change = createSharedChange(actorId, write)
    if (!change) {
      throw new Error('Local shared change must contain only live operations.')
    }

    doc.transact(() => {
      store.appendChange(change)
    }, localOrigin)

    localChangeIds.add(change.id)
    syncCursor(readSnapshot())
    localHistoryController.capturePublishedChange(change, write)
    maybeRotateCheckpoint()
  }

  const writeUnsubscribe = engine.write.subscribe(() => {
    const nextWrite = engine.write.get()
    if (!nextWrite || nextWrite === lastWrite) {
      return
    }
    lastWrite = nextWrite

    if (!bootstrapped || destroyed) {
      return
    }

    try {
      publishWrite(nextWrite)
    } catch {
      localHistoryController.failPending()
      reportError()
    }
  })

  const handleAfterTransaction = (transaction: Y.Transaction) => {
    if (!bootstrapped || destroyed) {
      return
    }
    if (transaction.origin === localOrigin) {
      return
    }

    try {
      consumeSnapshot({
        allowRotate: false
      })
    } catch {
      reportError()
    }
  }

  doc.on('afterTransaction', handleAfterTransaction)

  const bootstrapSession = () => {
    if (destroyed) {
      return
    }

    status.set('bootstrapping')

    const hasSharedData = store.hasData()
    if (hasSharedData) {
      consumeSnapshot({
        forceReset: true,
        allowRotate: false
      })
    } else {
      publishCheckpoint(engine.document.get())
    }

    bootstrapped = true
    status.set('connected')
  }

  const safeBootstrap = () => {
    try {
      bootstrapSession()
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

    maybeWaitForProviderSync(safeBootstrap)
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
        consumeSnapshot({
          forceReset: true,
          allowRotate: false
        })
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
    doc.off('afterTransaction', handleAfterTransaction)
    writeUnsubscribe()
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
