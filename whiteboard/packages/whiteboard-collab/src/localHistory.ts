import { store as coreStore } from '@shared/core'
import { historyFootprintConflicts } from '@whiteboard/core/spec/history'
import { sync } from '@whiteboard/core/spec/operation'
import type { Engine } from '@whiteboard/engine'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { HistoryState } from '@whiteboard/history'
import type {
  CollabLocalHistory
} from '@whiteboard/collab/types/session'
import type {
  SharedChange,
  SharedOperation
} from '@whiteboard/collab/types/shared'

type ObservedChangeClock = {
  nextSeq: number
  byChangeId: Map<string, number>
}

type LocalHistoryEntry = {
  id: string
  changeId: string
  baseSeq: number
  forward: readonly SharedOperation[]
  inverse: readonly SharedOperation[]
  footprint: SharedChange['footprint']
  state: 'live' | 'undone' | 'invalidated'
}

type PendingTransition =
  | { kind: 'undo'; entryId: string }
  | { kind: 'redo'; entryId: string }
  | null

type LocalHistoryRuntime = {
  undo: LocalHistoryEntry[]
  redo: LocalHistoryEntry[]
  invalidated: LocalHistoryEntry[]
  pending: PendingTransition
  clock: ObservedChangeClock
}

type LocalHistoryController = {
  localHistory: CollabLocalHistory
  capturePublishedChange: (
    change: SharedChange,
    write: EngineWrite
  ) => void
  observeRemoteChange: (
    change: SharedChange
  ) => void
  failPending: () => void
  clear: () => void
}

const EMPTY_STATE: HistoryState = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
  invalidatedDepth: 0,
  isApplying: false
}

const readHistoryCancelled = (
  message: string
): CommandResult => ({
  ok: false,
  error: {
    code: 'cancelled',
    message
  }
})

const createRuntime = (): LocalHistoryRuntime => ({
  undo: [],
  redo: [],
  invalidated: [],
  pending: null,
  clock: {
    nextSeq: 1,
    byChangeId: new Map()
  }
})

const readObservedSeqMax = (
  clock: ObservedChangeClock
): number => clock.nextSeq - 1

const observeChange = (
  clock: ObservedChangeClock,
  changeId: string
): { seq: number; isNew: boolean } => {
  const existing = clock.byChangeId.get(changeId)
  if (existing !== undefined) {
    return {
      seq: existing,
      isNew: false
    }
  }

  const seq = clock.nextSeq
  clock.nextSeq += 1
  clock.byChangeId.set(changeId, seq)
  return {
    seq,
    isNew: true
  }
}

const toSharedOperations = (
  operations: readonly import('@whiteboard/core/types').Operation[]
): readonly SharedOperation[] | null => {
  const shared = operations.filter((op) => sync.isLive(op))
  return shared.length === operations.length
    ? shared as readonly SharedOperation[]
    : null
}

const findEntry = (
  entries: readonly LocalHistoryEntry[],
  entryId: string
): LocalHistoryEntry | undefined => entries.find((entry) => entry.id === entryId)

const publishState = (
  stateStore: ReturnType<typeof coreStore.createValueStore<HistoryState>>,
  runtime: LocalHistoryRuntime
) => {
  stateStore.set({
    canUndo: runtime.undo.length > 0,
    canRedo: runtime.redo.length > 0,
    undoDepth: runtime.undo.length,
    redoDepth: runtime.redo.length,
    invalidatedDepth: runtime.invalidated.length,
    isApplying: runtime.pending !== null,
    lastUpdatedAt: Date.now()
  })
}

const moveToInvalidated = (
  runtime: LocalHistoryRuntime,
  entry: LocalHistoryEntry
) => {
  const next = {
    ...entry,
    state: 'invalidated' as const
  }
  runtime.undo = runtime.undo.filter((candidate) => candidate.id !== entry.id)
  runtime.redo = runtime.redo.filter((candidate) => candidate.id !== entry.id)
  runtime.invalidated = runtime.invalidated.some((candidate) => candidate.id === entry.id)
    ? runtime.invalidated.map((candidate) => candidate.id === entry.id ? next : candidate)
    : [...runtime.invalidated, next]
}

export const createLocalHistoryController = ({
  engine,
  canApply
}: {
  engine: Engine
  canApply: () => boolean
}): LocalHistoryController => {
  const runtime = createRuntime()
  const state = coreStore.createValueStore<HistoryState>(EMPTY_STATE)

  const failPending = () => {
    if (!runtime.pending) {
      return
    }
    const entry = findEntry(
      runtime.pending.kind === 'undo'
        ? runtime.undo
        : runtime.redo,
      runtime.pending.entryId
    )
    if (entry) {
      moveToInvalidated(runtime, entry)
    }
    runtime.pending = null
    publishState(state, runtime)
  }

  const capturePublishedChange = (
    change: SharedChange,
    write: EngineWrite
  ) => {
    const baseSeq = readObservedSeqMax(runtime.clock)
    observeChange(runtime.clock, change.id)

    if (runtime.pending) {
      const pending = runtime.pending
      const source = runtime.pending.kind === 'undo'
        ? runtime.undo
        : runtime.redo
      const entry = findEntry(source, runtime.pending.entryId)
      if (!entry) {
        runtime.pending = null
        publishState(state, runtime)
        return
      }

      runtime.pending = null
      const nextEntry: LocalHistoryEntry = {
        ...entry,
        baseSeq,
        state: pending.kind === 'undo'
          ? 'undone'
          : 'live'
      }
      if (pending.kind === 'undo') {
        runtime.undo = runtime.undo.filter((candidate) => candidate.id !== entry.id)
        runtime.redo = [...runtime.redo.filter((candidate) => candidate.id !== entry.id), {
          ...nextEntry,
          state: 'undone'
        }]
      } else {
        runtime.redo = runtime.redo.filter((candidate) => candidate.id !== entry.id)
        runtime.undo = [...runtime.undo.filter((candidate) => candidate.id !== entry.id), {
          ...nextEntry,
          state: 'live'
        }]
      }
      publishState(state, runtime)
      return
    }

    if (write.origin !== 'user') {
      return
    }

    const forward = toSharedOperations(write.forward)
    const inverse = toSharedOperations(write.inverse)
    if (
      !forward
      || !inverse
      || forward.length === 0
      || inverse.length === 0
      || write.forward.some((op) => sync.isCheckpointOnly(op))
    ) {
      return
    }

    runtime.undo = [
      ...runtime.undo,
      {
        id: change.id,
        changeId: change.id,
        baseSeq,
        forward,
        inverse,
        footprint: change.footprint,
        state: 'live'
      }
    ]
    runtime.redo = []
    publishState(state, runtime)
  }

  const observeRemoteChange = (
    change: SharedChange
  ) => {
    const observed = observeChange(runtime.clock, change.id)
    if (!observed.isNew) {
      return
    }

    runtime.undo.slice().forEach((entry) => {
      if (
        entry.baseSeq < observed.seq
        && historyFootprintConflicts(entry.footprint, change.footprint)
      ) {
        moveToInvalidated(runtime, entry)
      }
    })

    runtime.redo.slice().forEach((entry) => {
      if (
        entry.baseSeq < observed.seq
        && historyFootprintConflicts(entry.footprint, change.footprint)
      ) {
        moveToInvalidated(runtime, entry)
      }
    })

    publishState(state, runtime)
  }

  const clear = () => {
    runtime.undo = []
    runtime.redo = []
    runtime.invalidated = []
    runtime.pending = null
    publishState(state, runtime)
  }

  const undo = (): CommandResult => {
    if (!canApply()) {
      return readHistoryCancelled('Collaboration session is not connected.')
    }
    if (runtime.pending) {
      return readHistoryCancelled('History operation is already applying.')
    }
    const entry = runtime.undo[runtime.undo.length - 1]
    if (!entry) {
      return readHistoryCancelled('Nothing to undo.')
    }

    runtime.pending = {
      kind: 'undo',
      entryId: entry.id
    }
    publishState(state, runtime)

    const result = engine.apply(entry.inverse, {
      origin: 'user'
    })
    if (!result.ok) {
      failPending()
    }
    return result
  }

  const redo = (): CommandResult => {
    if (!canApply()) {
      return readHistoryCancelled('Collaboration session is not connected.')
    }
    if (runtime.pending) {
      return readHistoryCancelled('History operation is already applying.')
    }
    const entry = runtime.redo[runtime.redo.length - 1]
    if (!entry) {
      return readHistoryCancelled('Nothing to redo.')
    }

    runtime.pending = {
      kind: 'redo',
      entryId: entry.id
    }
    publishState(state, runtime)

    const result = engine.apply(entry.forward, {
      origin: 'user'
    })
    if (!result.ok) {
      failPending()
    }
    return result
  }

  return {
    localHistory: {
      get: state.get,
      subscribe: state.subscribe,
      undo,
      redo,
      clear
    },
    capturePublishedChange,
    observeRemoteChange,
    failPending,
    clear
  }
}
