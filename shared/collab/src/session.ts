import { store } from '@shared/core'
import {
  mutationFailure,
  type HistoryController,
  type LocalHistoryApi,
  type LocalHistoryState,
  type Origin,
  type Write,
  type WriteStream
} from '@shared/mutation'
import {
  createSyncCursor,
  normalizeSnapshot,
  planReplay,
  type CollabSnapshot
} from './replay'

export type CollabStatus =
  | 'idle'
  | 'connecting'
  | 'bootstrapping'
  | 'connected'
  | 'disconnected'
  | 'error'

export type CollabDiagnostics = {
  duplicateChangeIds: readonly string[]
  rejectedChangeIds: readonly string[]
}

export type CollabProvider = {
  connect?: () => void
  disconnect?: () => void
  destroy?: () => void
  isSynced?: () => boolean
  subscribeSync?(listener: (synced: boolean) => void): (() => void)
  awareness?: unknown
}

export type CollabStore<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
> = {
  read(): CollabSnapshot<Change, Checkpoint>
  subscribe(listener: () => void): (() => void)
  append(change: Change): void
  checkpoint(checkpoint: Checkpoint): void
  clearChanges(): void
}

export type MutationEngineLike<
  Doc,
  Op,
  Key,
  Result extends {
    ok: boolean
  },
  W extends Write<Doc, Op, Key, any> = Write<Doc, Op, Key, any>
> = {
  doc(): Doc
  replace(
    doc: Doc,
    options?: {
      origin?: Origin
    }
  ): boolean
  apply(
    ops: readonly Op[],
    options?: {
      origin?: Origin
    }
  ): Result
  writes: WriteStream<W>
  history?: HistoryController<Op, Key, W>
}

export type MutationCollabSessionOptions<
  Doc,
  Op,
  Key,
  WriteRecord extends Write<Doc, Op, Key, any>,
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
> = {
  actor: {
    id: string
    createChangeId(): string
  }
  transport: {
    store: CollabStore<Change, Checkpoint>
    provider?: CollabProvider
  }
  document: {
    empty(): Doc
    checkpointEvery?: number
    checkpoint: {
      create(doc: Doc): Checkpoint
      read(checkpoint: Checkpoint): Doc
    }
  }
  change: {
    create(
      write: WriteRecord,
      meta: {
        actorId: string
        changeId: string
      }
    ): Change | null
    read(
      change: Change
    ):
      | {
          kind: 'apply'
          operations: readonly Op[]
        }
      | {
          kind: 'replace'
          document: Doc
        }
    footprint(change: Change): readonly Key[]
  }
  policy?: {
    canPublish?(write: WriteRecord): boolean
    canObserve?(): boolean
  }
}

export type MutationCollabSession<
  Result extends {
    ok: boolean
  }
> = {
  awareness?: unknown
  status: store.ReadStore<CollabStatus>
  diagnostics: store.ReadStore<CollabDiagnostics>
  history: LocalHistoryApi<Result>
  connect(): void
  disconnect(): void
  resync(): void
  destroy(): void
}

const readUnavailable = <Result extends {
  ok: boolean
}>(
  message: string
): Result => mutationFailure(
  'cancelled',
  message
) as unknown as Result

const createCollabHistory = <
  Doc,
  Op,
  Key,
  Result extends {
    ok: boolean
  },
  W extends Write<Doc, Op, Key, any>
>(input: {
  engine: MutationEngineLike<Doc, Op, Key, Result, W>
  canRun: () => boolean
}) => {
  if (!input.engine.history) {
    throw new Error('createMutationCollabSession requires engine.history.')
  }

  const controller = input.engine.history
  const state = store.createValueStore<LocalHistoryState>({
    ...controller.state(),
    lastUpdatedAt: undefined
  })

  const publish = () => {
    state.set({
      ...controller.state(),
      lastUpdatedAt: Date.now()
    })
  }

  input.engine.writes.subscribe(() => {
    publish()
  })

  const failPending = () => {
    controller.cancel('invalidate')
  }

  const run = (
    kind: 'undo' | 'redo'
  ): Result => {
    if (!input.canRun()) {
      return readUnavailable('Collaboration session is not connected.')
    }

    const operations = kind === 'undo'
      ? controller.undo()
      : controller.redo()
    if (!operations) {
      return readUnavailable(
        kind === 'undo'
          ? 'Nothing to undo.'
          : 'Nothing to redo.'
      )
    }

    publish()

    const result = input.engine.apply(operations, {
      origin: 'history'
    })
    if (!result.ok) {
      failPending()
      publish()
      return result
    }

    publish()
    return result
  }

  const history: LocalHistoryApi<Result> = {
    get: state.get,
    subscribe: state.subscribe,
    undo: () => run('undo'),
    redo: () => run('redo'),
    clear: () => {
      if (controller.clear()) {
        publish()
      }
    }
  }

  return {
    controller,
    history,
    publish,
    confirm(input?: {
      id?: string
      footprint?: readonly Key[]
    }) {
      if (controller.confirm(input)) {
        publish()
      }
    },
    observe(changeId: string, footprint: readonly Key[]) {
      if (controller.observe(changeId, footprint)) {
        publish()
      }
    },
    cancel(mode: 'restore' | 'invalidate') {
      if (controller.cancel(mode)) {
        publish()
      }
    },
    clear() {
      if (controller.clear()) {
        publish()
      }
    }
  }
}

export const createMutationCollabSession = <
  Doc,
  Op,
  Key,
  Result extends {
    ok: boolean
  },
  WriteRecord extends Write<Doc, Op, Key, any>,
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
>(
  engine: MutationEngineLike<Doc, Op, Key, Result, WriteRecord>,
  options: MutationCollabSessionOptions<
    Doc,
    Op,
    Key,
    WriteRecord,
    Change,
    Checkpoint
  >
): MutationCollabSession<Result> => {
  if (options.actor.id.length === 0) {
    throw new Error('createMutationCollabSession requires a non-empty actor.id.')
  }

  const status = store.createValueStore<CollabStatus>('idle')
  const diagnostics = store.createValueStore<CollabDiagnostics>({
    duplicateChangeIds: [],
    rejectedChangeIds: []
  })

  let destroyed = false
  let started = false
  let bootstrapped = false
  let waitingForProviderSync = false
  let rotatingCheckpoint = false
  let suppressLocalPublish = false
  let suppressStoreEvents = false
  let unsubscribeStore: (() => void) | undefined
  let unsubscribeWrites: (() => void) | undefined
  let unsubscribeProviderSync: (() => void) | undefined
  let cursor = {
    checkpointId: null as string | null,
    changeIds: [] as readonly string[]
  }

  const duplicateChangeIds = new Set<string>()
  const rejectedChangeIds = new Set<string>()
  const localChangeIds = new Set<string>()

  const publishDiagnostics = () => {
    diagnostics.set({
      duplicateChangeIds: [...duplicateChangeIds],
      rejectedChangeIds: [...rejectedChangeIds]
    })
  }

  const historyRuntime = createCollabHistory({
    engine,
    canRun: () => (
      !destroyed
      && bootstrapped
      && (options.policy?.canObserve?.() ?? true)
    )
  })

  const readSnapshot = () => normalizeSnapshot(
    options.transport.store.read()
  )

  const syncCursor = () => {
    cursor = createSyncCursor(readSnapshot())
  }

  const trackDuplicates = (ids?: readonly string[]) => {
    if (!ids?.length) {
      return
    }

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

  const replayChanges = (
    changes: readonly Change[]
  ) => {
    if (options.policy?.canObserve && !options.policy.canObserve()) {
      return
    }

    changes.forEach((change) => {
      if (localChangeIds.has(change.id)) {
        return
      }

      historyRuntime.observe(
        change.id,
        options.change.footprint(change)
      )

      try {
        const effect = options.change.read(change)
        if (effect.kind === 'replace') {
          const replaced = engine.replace(effect.document, {
            origin: 'remote'
          })
          if (!replaced) {
            trackRejected(change.id)
          }
          return
        }

        const applied = engine.apply(effect.operations, {
          origin: 'remote'
        })
        if (!applied.ok) {
          trackRejected(change.id)
        }
      } catch {
        trackRejected(change.id)
      }
    })
  }

  const publishCheckpoint = (
    nextDocument: Doc
  ) => {
    suppressStoreEvents = true
    try {
      options.transport.store.checkpoint(
        options.document.checkpoint.create(nextDocument)
      )
      options.transport.store.clearChanges()
    } finally {
      suppressStoreEvents = false
    }

    const snapshot = readSnapshot()
    trackDuplicates(snapshot.duplicateChangeIds)
    if (snapshot.changes.length === 0) {
      cursor = createSyncCursor(snapshot)
      return
    }

    consumeSnapshot(true)
  }

  const maybeRotateCheckpoint = () => {
    if (rotatingCheckpoint || (options.document.checkpointEvery ?? 0) <= 0) {
      return
    }

    const snapshot = readSnapshot()
    if (snapshot.changes.length < (options.document.checkpointEvery ?? 0)) {
      return
    }

    rotatingCheckpoint = true
    try {
      publishCheckpoint(engine.doc())
    } finally {
      rotatingCheckpoint = false
    }
  }

  const publishWrite = (
    write: WriteRecord
  ) => {
    if (write.origin === 'remote' || suppressLocalPublish) {
      return
    }
    if (write.forward.length === 0) {
      return
    }
    if (options.policy?.canPublish && !options.policy.canPublish(write)) {
      return
    }

    const change = options.change.create(write, {
      actorId: options.actor.id,
      changeId: options.actor.createChangeId()
    })

    if (!change) {
      publishCheckpoint(engine.doc())
      historyRuntime.clear()
      return
    }

    localChangeIds.add(change.id)
    suppressStoreEvents = true
    try {
      options.transport.store.append(change)
    } finally {
      suppressStoreEvents = false
    }

    syncCursor()

    if (historyRuntime.controller.state().isApplying) {
      historyRuntime.confirm({
        id: change.id,
        footprint: options.change.footprint(change)
      })
    }

    maybeRotateCheckpoint()
  }

  const consumeSnapshot = (
    forceReset = false
  ) => {
    const snapshot = readSnapshot()
    trackDuplicates(snapshot.duplicateChangeIds)

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
      cursor = createSyncCursor(snapshot)
      return
    }

    suppressLocalPublish = true
    try {
      const baseDocument = plan.checkpoint
        ? options.document.checkpoint.read(plan.checkpoint)
        : options.document.empty()

      const replaced = engine.replace(baseDocument, {
        origin: 'remote'
      })
      if (!replaced) {
        throw new Error('Collab reset replace failed.')
      }

      replayChanges(plan.changes)
    } finally {
      suppressLocalPublish = false
    }

    cursor = createSyncCursor(snapshot)
  }

  const bootstrap = () => {
    const snapshot = readSnapshot()
    trackDuplicates(snapshot.duplicateChangeIds)

    if (snapshot.checkpoint || snapshot.changes.length > 0) {
      consumeSnapshot(true)
      return
    }

    publishCheckpoint(engine.doc())
  }

  const startCore = () => {
    if (started) {
      return
    }

    bootstrap()
    unsubscribeWrites = engine.writes.subscribe((write) => {
      try {
        publishWrite(write)
      } catch {
        historyRuntime.cancel('invalidate')
        reportError()
      }
    })
    unsubscribeStore = options.transport.store.subscribe(() => {
      if (suppressStoreEvents) {
        return
      }

      try {
        consumeSnapshot(false)
      } catch {
        reportError()
      }
    })
    started = true
  }

  const stopCore = () => {
    if (!started) {
      return
    }

    unsubscribeWrites?.()
    unsubscribeWrites = undefined
    unsubscribeStore?.()
    unsubscribeStore = undefined
    started = false
  }

  const maybeWaitForProviderSync = (
    onReady: () => void
  ) => {
    const provider = options.transport.provider
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

  const safeStart = () => {
    try {
      status.set('bootstrapping')
      startCore()
      bootstrapped = true
      status.set('connected')
    } catch {
      reportError()
    }
  }

  const connect = () => {
    if (destroyed) {
      return
    }

    options.transport.provider?.connect?.()

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

    options.transport.provider?.disconnect?.()
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
          startCore()
        } else {
          consumeSnapshot(true)
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
    options.transport.provider?.destroy?.()
    stopCore()
    waitingForProviderSync = false
    status.set('disconnected')
  }

  return {
    awareness: options.transport.provider?.awareness,
    status,
    diagnostics,
    history: historyRuntime.history,
    connect,
    disconnect,
    resync,
    destroy
  }
}
