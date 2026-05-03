import { store } from '@shared/core'
import type {
  MutationCommit,
  MutationDocument,
  MutationOrigin,
  MutationSchema,
  MutationWrite,
  SerializedMutationWrite,
} from '@shared/mutation'
import {
  createMutationConflictScopes,
  deserializeMutationWrites,
  mutationConflictScopesIntersect,
  serializeMutationWrites,
  type MutationConflictScope,
} from '@shared/mutation'
import {
  createSyncCursor,
  normalizeSnapshot,
  planReplay,
  type CollabSnapshot,
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

export type MutationCollabChange = {
  id: string
  actorId: string
  writes: readonly SerializedMutationWrite[]
}

export type MutationCollabCheckpoint<TDocument> = {
  id: string
  document: TDocument
}

export type MutationCollabHistoryState = {
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
}

export type MutationCollabLocalHistory<TApplyResult> = {
  get(): MutationCollabHistoryState
  subscribe(listener: () => void): () => void
  undo(): TApplyResult | undefined
  redo(): TApplyResult | undefined
  clear(): void
}

export type MutationCollabEngine<
  TSchema extends MutationSchema,
  TApplyResult
> = {
  commits: {
    subscribe(listener: (commit: MutationCommit<TSchema>) => void): () => void
  }
  doc(): MutationDocument<TSchema>
  replace(
    document: MutationDocument<TSchema>,
    options?: {
      origin?: MutationOrigin
      history?: boolean
    }
  ): unknown
  apply(
    writes: readonly MutationWrite[],
    options?: {
      origin?: MutationOrigin
      history?: boolean
    }
  ): TApplyResult
}

export type MutationCollabSessionOptions<
  TSchema extends MutationSchema,
  TApplyResult
> = {
  schema: TSchema
  actor: {
    id: string
    createChangeId(): string
  }
  transport: {
    store: CollabStore<
      MutationCollabChange,
      MutationCollabCheckpoint<MutationDocument<TSchema>>
    >
    provider?: CollabProvider
  }
  document: {
    empty(): MutationDocument<TSchema>
    checkpointEvery?: number
  }
  policy?: {
    canPublish?(commit: MutationCommit<TSchema>): boolean
    canObserve?(): boolean
  }
}

export type MutationCollabSession<TApplyResult> = {
  awareness?: unknown
  status: store.ReadStore<CollabStatus>
  diagnostics: store.ReadStore<CollabDiagnostics>
  localHistory: MutationCollabLocalHistory<TApplyResult>
  connect(): void
  disconnect(): void
  resync(): void
  destroy(): void
}

type MutationCollabHistoryEntry = {
  changeId: string
  writes: readonly MutationWrite[]
  inverse: readonly MutationWrite[]
  scopes: readonly MutationConflictScope[]
  invalidated: boolean
}

type PendingHistoryAction =
  | {
      kind: 'undo'
      entry: MutationCollabHistoryEntry
    }
  | {
      kind: 'redo'
      entry: MutationCollabHistoryEntry
    }

const isApplyFailure = (
  value: unknown
): value is {
  ok: false
} => Boolean(
  value
  && typeof value === 'object'
  && 'ok' in (value as Record<string, unknown>)
  && (value as Record<string, unknown>).ok === false
)

const isSameHistoryEntry = (
  left: MutationCollabHistoryEntry,
  right: MutationCollabHistoryEntry
): boolean => left.changeId === right.changeId

const countLiveEntries = (
  entries: readonly MutationCollabHistoryEntry[]
): number => entries.filter((entry) => !entry.invalidated).length

const countInvalidatedEntries = (
  entries: readonly MutationCollabHistoryEntry[]
): number => entries.filter((entry) => entry.invalidated).length

const findLatestLiveEntry = (
  entries: readonly MutationCollabHistoryEntry[]
): MutationCollabHistoryEntry | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry && !entry.invalidated) {
      return entry
    }
  }
  return undefined
}

const removeHistoryEntry = (
  entries: readonly MutationCollabHistoryEntry[],
  target: MutationCollabHistoryEntry
): MutationCollabHistoryEntry[] => entries.filter((entry) => !isSameHistoryEntry(entry, target))

const markInvalidatedEntries = (
  entries: readonly MutationCollabHistoryEntry[],
  scopes: readonly MutationConflictScope[]
): MutationCollabHistoryEntry[] => entries.map((entry) => entry.invalidated
  ? entry
  : scopes.some((remoteScope) => entry.scopes.some((localScope) => (
      mutationConflictScopesIntersect(localScope, remoteScope)
    )))
    ? {
        ...entry,
        invalidated: true
      }
    : entry
)

export const createMutationCollabSession = <
  TSchema extends MutationSchema,
  TApplyResult
>(
  engine: MutationCollabEngine<TSchema, TApplyResult>,
  options: MutationCollabSessionOptions<TSchema, TApplyResult>
): MutationCollabSession<TApplyResult> => {
  if (options.actor.id.length === 0) {
    throw new Error('createMutationCollabSession requires a non-empty actor.id.')
  }

  const status = store.value<CollabStatus>('idle')
  const diagnostics = store.value<CollabDiagnostics>({
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

  let undoStack: MutationCollabHistoryEntry[] = []
  let redoStack: MutationCollabHistoryEntry[] = []
  let pendingHistoryAction: PendingHistoryAction | undefined
  const historyState = store.value<MutationCollabHistoryState>({
    undoDepth: 0,
    redoDepth: 0,
    invalidatedDepth: 0,
    isApplying: false
  })

  const publishHistoryState = (isApplying = pendingHistoryAction !== undefined) => {
    historyState.set({
      undoDepth: countLiveEntries(undoStack),
      redoDepth: countLiveEntries(redoStack),
      invalidatedDepth: countInvalidatedEntries(undoStack) + countInvalidatedEntries(redoStack),
      isApplying
    })
  }

  const clearLocalHistory = () => {
    undoStack = []
    redoStack = []
    pendingHistoryAction = undefined
    publishHistoryState(false)
  }

  const localHistory: MutationCollabLocalHistory<TApplyResult> = {
    get: historyState.get,
    subscribe: historyState.subscribe,
    undo: () => {
      const entry = findLatestLiveEntry(undoStack)
      if (!entry) {
        return undefined
      }

      pendingHistoryAction = {
        kind: 'undo',
        entry
      }
      publishHistoryState(true)
      const result = engine.apply(entry.inverse, {
        origin: 'history',
        history: false
      })
      if (isApplyFailure(result)) {
        pendingHistoryAction = undefined
        publishHistoryState(false)
      }
      return result
    },
    redo: () => {
      const entry = findLatestLiveEntry(redoStack)
      if (!entry) {
        return undefined
      }

      pendingHistoryAction = {
        kind: 'redo',
        entry
      }
      publishHistoryState(true)
      const result = engine.apply(entry.writes, {
        origin: 'history',
        history: false
      })
      if (isApplyFailure(result)) {
        pendingHistoryAction = undefined
        publishHistoryState(false)
      }
      return result
    },
    clear: clearLocalHistory
  }

  const publishDiagnostics = () => {
    diagnostics.set({
      duplicateChangeIds: [...duplicateChangeIds],
      rejectedChangeIds: [...rejectedChangeIds]
    })
  }

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

  const trackRejected = (id: string) => {
    if (rejectedChangeIds.has(id)) {
      return
    }

    rejectedChangeIds.add(id)
    publishDiagnostics()
  }

  const reportError = () => {
    pendingHistoryAction = undefined
    publishHistoryState(false)
    status.set('error')
  }

  const capturePublishedLocalCommit = (
    changeId: string,
    commit: MutationCommit<TSchema>
  ) => {
    if (pendingHistoryAction?.kind === 'undo') {
      undoStack = removeHistoryEntry(undoStack, pendingHistoryAction.entry)
      redoStack = [...redoStack, pendingHistoryAction.entry]
      pendingHistoryAction = undefined
      publishHistoryState(false)
      return
    }

    if (pendingHistoryAction?.kind === 'redo') {
      redoStack = removeHistoryEntry(redoStack, pendingHistoryAction.entry)
      undoStack = [...undoStack, pendingHistoryAction.entry]
      pendingHistoryAction = undefined
      publishHistoryState(false)
      return
    }

    undoStack = [
      ...undoStack,
      {
        changeId,
        writes: commit.writes,
        inverse: commit.inverse,
        scopes: createMutationConflictScopes(commit.writes),
        invalidated: false
      }
    ]
    redoStack = []
    publishHistoryState(false)
  }

  const invalidateWithRemoteWrites = (
    writes: readonly MutationWrite[]
  ) => {
    const scopes = createMutationConflictScopes(writes)
    if (scopes.length === 0) {
      return
    }
    undoStack = markInvalidatedEntries(undoStack, scopes)
    redoStack = markInvalidatedEntries(redoStack, scopes)
    publishHistoryState(pendingHistoryAction !== undefined)
  }

  const publishCheckpoint = (
    nextDocument: MutationDocument<TSchema>
  ) => {
    suppressStoreEvents = true
    try {
      options.transport.store.checkpoint({
        id: options.actor.createChangeId(),
        document: nextDocument
      })
      options.transport.store.clearChanges()
    } finally {
      suppressStoreEvents = false
    }

    clearLocalHistory()
    const snapshot = readSnapshot()
    trackDuplicates(snapshot.duplicateChangeIds)
    cursor = createSyncCursor(snapshot)
  }

  const maybeRotateCheckpoint = () => {
    const threshold = options.document.checkpointEvery ?? 0
    if (rotatingCheckpoint || threshold <= 0) {
      return
    }

    const snapshot = readSnapshot()
    if (snapshot.changes.length < threshold) {
      return
    }

    rotatingCheckpoint = true
    try {
      publishCheckpoint(engine.doc())
    } finally {
      rotatingCheckpoint = false
    }
  }

  const replayChanges = (
    changes: readonly MutationCollabChange[]
  ) => {
    if (options.policy?.canObserve && !options.policy.canObserve()) {
      return
    }

    changes.forEach((change) => {
      if (localChangeIds.has(change.id)) {
        return
      }

      try {
        const writes = deserializeMutationWrites(
          options.schema,
          change.writes
        )
        const applied = engine.apply(writes, {
          origin: 'remote',
          history: false
        })
        if (isApplyFailure(applied)) {
          trackRejected(change.id)
          return
        }
        invalidateWithRemoteWrites(writes)
      } catch {
        trackRejected(change.id)
      }
    })
  }

  const publishCommit = (
    commit: MutationCommit<TSchema>
  ) => {
    if (commit.origin === 'remote' || suppressLocalPublish) {
      return
    }

    if (commit.kind === 'replace') {
      publishCheckpoint(commit.document)
      return
    }

    if (commit.writes.length === 0) {
      if (pendingHistoryAction) {
        pendingHistoryAction = undefined
        publishHistoryState(false)
      }
      return
    }

    if (options.policy?.canPublish && !options.policy.canPublish(commit)) {
      if (pendingHistoryAction) {
        pendingHistoryAction = undefined
        publishHistoryState(false)
      }
      return
    }

    const changeId = options.actor.createChangeId()
    const change: MutationCollabChange = {
      id: changeId,
      actorId: options.actor.id,
      writes: serializeMutationWrites(commit.writes)
    }

    localChangeIds.add(change.id)
    suppressStoreEvents = true
    try {
      options.transport.store.append(change)
    } finally {
      suppressStoreEvents = false
    }

    syncCursor()
    capturePublishedLocalCommit(changeId, commit)
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

    clearLocalHistory()
    suppressLocalPublish = true
    try {
      const baseDocument = plan.checkpoint?.document ?? options.document.empty()
      engine.replace(baseDocument, {
        origin: 'remote',
        history: false
      })
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
    unsubscribeWrites = engine.commits.subscribe((commit) => {
      try {
        publishCommit(commit)
      } catch {
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
    clearLocalHistory()
    status.set('disconnected')
  }

  return {
    awareness: options.transport.provider?.awareness,
    status,
    diagnostics,
    localHistory,
    connect,
    disconnect,
    resync,
    destroy
  }
}
