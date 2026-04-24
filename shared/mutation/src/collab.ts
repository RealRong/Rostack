import {
  meta,
  type OpMetaTable
} from './meta'
import type {
  HistoryController
} from './history'
import type {
  Origin,
  Write,
  WriteStream
} from './write'

export interface Change<Op, Key> {
  id: string
  actorId: string
  ops: readonly Op[]
  footprint: readonly Key[]
}

export interface Checkpoint<Doc> {
  id: string
  doc: Doc
}

export interface CollabStore<Doc, Op, Key> {
  read(): {
    checkpoint: Checkpoint<Doc> | null
    changes: readonly Change<Op, Key>[]
  }
  subscribe(listener: () => void): () => void
  append(change: Change<Op, Key>): void
  checkpoint(checkpoint: Checkpoint<Doc>): void
  clearChanges(): void
}

export interface CollabEngine<
  Doc,
  Op,
  Key,
  W extends Write<Doc, Op, Key, any>
> {
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
  ): boolean
  writes: WriteStream<W>
}

export interface CollabSession {
  start(): void
  stop(): void
  resync(): void
}

type Cursor = {
  checkpointId: string | null
  changeIds: readonly string[]
}

type ReplayPlan<Doc, Op, Key> =
  | {
      kind: 'append'
      changes: readonly Change<Op, Key>[]
    }
  | {
      kind: 'reset'
      checkpoint: Checkpoint<Doc> | null
      changes: readonly Change<Op, Key>[]
    }

const createCursor = <Doc, Op, Key>(
  snapshot: ReturnType<CollabStore<Doc, Op, Key>['read']>
): Cursor => ({
  checkpointId: snapshot.checkpoint?.id ?? null,
  changeIds: snapshot.changes.map((change) => change.id)
})

const planReplay = <Doc, Op, Key>(input: {
  cursor: Cursor
  snapshot: ReturnType<CollabStore<Doc, Op, Key>['read']>
  forceReset?: boolean
}): ReplayPlan<Doc, Op, Key> => {
  if (input.forceReset) {
    return {
      kind: 'reset',
      checkpoint: input.snapshot.checkpoint,
      changes: input.snapshot.changes
    }
  }

  const nextCheckpointId = input.snapshot.checkpoint?.id ?? null
  if (nextCheckpointId !== input.cursor.checkpointId) {
    return {
      kind: 'reset',
      checkpoint: input.snapshot.checkpoint,
      changes: input.snapshot.changes
    }
  }

  const nextChangeIds = input.snapshot.changes.map((change) => change.id)
  if (input.cursor.changeIds.length > nextChangeIds.length) {
    return {
      kind: 'reset',
      checkpoint: input.snapshot.checkpoint,
      changes: input.snapshot.changes
    }
  }

  for (let index = 0; index < input.cursor.changeIds.length; index += 1) {
    if (input.cursor.changeIds[index] !== nextChangeIds[index]) {
      return {
        kind: 'reset',
        checkpoint: input.snapshot.checkpoint,
        changes: input.snapshot.changes
      }
    }
  }

  return {
    kind: 'append',
    changes: input.snapshot.changes.slice(input.cursor.changeIds.length)
  }
}

const readLiveOperations = <Op extends { type: string }>(
  table: OpMetaTable<Op>,
  operations: readonly Op[]
): {
  live: readonly Op[]
  checkpointOnly: boolean
} => {
  const live = operations.filter((operation) => meta.isLive(table, operation))
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

export const collab = {
  create<
    Doc,
    Op extends { type: string },
    Key,
    W extends Write<Doc, Op, Key, any>
  >(input: {
    actorId: string
    engine: CollabEngine<Doc, Op, Key, W>
    store: CollabStore<Doc, Op, Key>
    meta: OpMetaTable<Op>
    history: HistoryController<Op, Key, W>
    empty: () => Doc
    createId: () => string
    checkpointEvery?: number
    onReject?: (change: Change<Op, Key>, error?: unknown) => void
    onError?: (error: unknown) => void
  }): CollabSession {
    if (input.actorId.length === 0) {
      throw new Error('collab.create requires a non-empty actorId.')
    }

    let started = false
    let rotatingCheckpoint = false
    let cursor: Cursor = {
      checkpointId: null,
      changeIds: []
    }
    let unsubscribeStore: (() => void) | undefined
    let unsubscribeWrites: (() => void) | undefined
    const localChangeIds = new Set<string>()
    let suppressLocalPublish = false
    let suppressStoreEvents = false

    const syncCursor = (
      snapshot: ReturnType<typeof input.store.read>
    ) => {
      cursor = createCursor(snapshot)
    }

    const replayChanges = (
      changes: readonly Change<Op, Key>[]
    ) => {
      changes.forEach((change) => {
        if (localChangeIds.has(change.id)) {
          return
        }
        input.history.observe(change.id, change.footprint)

        try {
          const applied = input.engine.apply(change.ops, {
            origin: 'remote'
          })
          if (!applied) {
            input.onReject?.(change)
          }
        } catch (error) {
          input.onReject?.(change, error)
        }
      })
    }

    const consumeSnapshot = (
      forceReset = false
    ) => {
      const snapshot = input.store.read()
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
        return
      }

      suppressLocalPublish = true
      try {
        const baseDocument = plan.checkpoint?.doc ?? input.empty()
        const replaced = input.engine.replace(baseDocument, {
          origin: 'remote'
        })
        if (!replaced) {
          throw new Error('Collab reset replace failed.')
        }
        replayChanges(plan.changes)
      } finally {
        suppressLocalPublish = false
      }
      syncCursor(snapshot)
    }

    const publishCheckpoint = (
      nextDocument: Doc
    ) => {
      suppressStoreEvents = true
      try {
        input.store.checkpoint({
          id: input.createId(),
          doc: nextDocument
        })
        input.store.clearChanges()
      } finally {
        suppressStoreEvents = false
      }

      const snapshot = input.store.read()
      if (snapshot.changes.length === 0) {
        syncCursor(snapshot)
        return
      }

      consumeSnapshot(true)
    }

    const maybeRotateCheckpoint = () => {
      if (rotatingCheckpoint || (input.checkpointEvery ?? 0) <= 0) {
        return
      }

      const snapshot = input.store.read()
      if (snapshot.changes.length < (input.checkpointEvery ?? 0)) {
        return
      }

      rotatingCheckpoint = true
      try {
        publishCheckpoint(input.engine.doc())
      } finally {
        rotatingCheckpoint = false
      }
    }

    const publishWrite = (
      write: W
    ) => {
      if (write.origin === 'remote' || suppressLocalPublish) {
        return
      }
      if (write.forward.length === 0) {
        return
      }

      const live = readLiveOperations(input.meta, write.forward)
      if (live.checkpointOnly) {
        publishCheckpoint(input.engine.doc())
        input.history.clear()
        return
      }

      const change: Change<Op, Key> = {
        id: input.createId(),
        actorId: input.actorId,
        ops: live.live,
        footprint: write.footprint
      }

      localChangeIds.add(change.id)
      suppressStoreEvents = true
      try {
        input.store.append(change)
      } finally {
        suppressStoreEvents = false
      }
      syncCursor(input.store.read())

      if (input.history.state().isApplying) {
        input.history.confirm({
          id: change.id,
          footprint: change.footprint
        })
      }

      maybeRotateCheckpoint()
    }

    const bootstrap = () => {
      const snapshot = input.store.read()
      if (snapshot.checkpoint || snapshot.changes.length > 0) {
        consumeSnapshot(true)
        return
      }

      publishCheckpoint(input.engine.doc())
    }

    return {
      start: () => {
        if (started) {
          return
        }

        bootstrap()
        unsubscribeWrites = input.engine.writes.subscribe((write) => {
          try {
            publishWrite(write)
          } catch (error) {
            input.history.cancel('invalidate')
            input.onError?.(error)
          }
        })
        unsubscribeStore = input.store.subscribe(() => {
          if (suppressStoreEvents) {
            return
          }
          try {
            consumeSnapshot(false)
          } catch (error) {
            input.onError?.(error)
          }
        })
        started = true
      },
      stop: () => {
        if (!started) {
          return
        }
        unsubscribeWrites?.()
        unsubscribeWrites = undefined
        unsubscribeStore?.()
        unsubscribeStore = undefined
        started = false
      },
      resync: () => {
        consumeSnapshot(true)
      }
    }
  }
} as const
