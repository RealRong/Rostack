import type { ApplyCommit } from './write'

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
}

type HistoryPendingKind =
  | 'undo'
  | 'redo'

type HistoryPending = {
  kind: HistoryPendingKind
  entryId: string
} | null

type HistoryClock = {
  nextSeq: number
  byChangeId: Map<string, number>
}

type HistoryEntry<Op, Key> = {
  id: string
  forward: readonly Op[]
  inverse: readonly Op[]
  footprint: readonly Key[]
  baseSeq: number
  state: 'live' | 'undone' | 'invalidated'
}

export interface CaptureOptions<Key> {
  id?: string
  footprint?: readonly Key[]
}

export interface HistoryController<
  Op,
  Key,
  Commit extends ApplyCommit<any, Op, Key, any>
> {
  state(): HistoryState
  capture(commit: Commit, options?: CaptureOptions<Key>): boolean
  observe(changeId: string, footprint: readonly Key[]): boolean
  undo(): readonly Op[] | undefined
  redo(): readonly Op[] | undefined
  confirm(options?: CaptureOptions<Key>): boolean
  cancel(mode?: 'restore' | 'invalidate'): boolean
  clear(): boolean
}

const EMPTY_STATE: HistoryState = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
  invalidatedDepth: 0,
  isApplying: false
}

const readObservedSeqMax = (
  clock: HistoryClock
): number => clock.nextSeq - 1

const observeChange = (
  clock: HistoryClock,
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

const findEntry = <Op, Key>(
  entries: readonly HistoryEntry<Op, Key>[],
  entryId: string
): HistoryEntry<Op, Key> | undefined => entries.find((entry) => entry.id === entryId)

const trimUndo = <Op, Key>(
  entries: HistoryEntry<Op, Key>[],
  capacity: number
): HistoryEntry<Op, Key>[] => {
  if (capacity <= 0) {
    return []
  }
  if (entries.length <= capacity) {
    return entries
  }
  return entries.slice(entries.length - capacity)
}

const moveToInvalidated = <Op, Key>(input: {
  undo: HistoryEntry<Op, Key>[]
  redo: HistoryEntry<Op, Key>[]
  invalidated: HistoryEntry<Op, Key>[]
  entry: HistoryEntry<Op, Key>
}) => {
  const next: HistoryEntry<Op, Key> = {
    ...input.entry,
    state: 'invalidated'
  }
  return {
    undo: input.undo.filter((candidate) => candidate.id !== input.entry.id),
    redo: input.redo.filter((candidate) => candidate.id !== input.entry.id),
    invalidated: input.invalidated.some((candidate) => candidate.id === input.entry.id)
      ? input.invalidated.map((candidate) => candidate.id === input.entry.id ? next : candidate)
      : [...input.invalidated, next]
  }
}

export const history = {
  create<
    Op,
    Key,
    Commit extends ApplyCommit<any, Op, Key, any>
  >(input: {
    conflicts(
      left: readonly Key[],
      right: readonly Key[]
    ): boolean
    track?(commit: Commit): boolean
    capacity?: number
  }): HistoryController<Op, Key, Commit> {
    let nextEntryId = 1
    let undo: HistoryEntry<Op, Key>[] = []
    let redo: HistoryEntry<Op, Key>[] = []
    let invalidated: HistoryEntry<Op, Key>[] = []
    let pending: HistoryPending = null
    const clock: HistoryClock = {
      nextSeq: 1,
      byChangeId: new Map()
    }
    const capacity = Math.max(0, input.capacity ?? Number.POSITIVE_INFINITY)

    const state = (): HistoryState => ({
      canUndo: undo.length > 0,
      canRedo: redo.length > 0,
      undoDepth: undo.length,
      redoDepth: redo.length,
      invalidatedDepth: invalidated.length,
      isApplying: pending !== null
    })

    return {
      state,
      capture: (commit, options) => {
        if (pending) {
          return false
        }
        if (input.track && !input.track(commit)) {
          return false
        }
        if (!commit.forward.length || !commit.inverse.length) {
          return false
        }

        const footprint = options?.footprint ?? commit.footprint
        const entry: HistoryEntry<Op, Key> = {
          id: options?.id ?? `history_${nextEntryId++}`,
          forward: commit.forward,
          inverse: commit.inverse,
          footprint,
          baseSeq: readObservedSeqMax(clock),
          state: 'live'
        }

        if (options?.id) {
          observeChange(clock, options.id)
        }

        undo = trimUndo([...undo, entry], capacity)
        redo = []
        return true
      },
      observe: (changeId, footprint) => {
        const observed = observeChange(clock, changeId)
        if (!observed.isNew) {
          return false
        }

        undo.slice().forEach((entry) => {
          if (
            entry.baseSeq < observed.seq
            && input.conflicts(entry.footprint, footprint)
          ) {
            ({
              undo,
              redo,
              invalidated
            } = moveToInvalidated({
              undo,
              redo,
              invalidated,
              entry
            }))
          }
        })

        redo.slice().forEach((entry) => {
          if (
            entry.baseSeq < observed.seq
            && input.conflicts(entry.footprint, footprint)
          ) {
            ({
              undo,
              redo,
              invalidated
            } = moveToInvalidated({
              undo,
              redo,
              invalidated,
              entry
            }))
          }
        })
        return true
      },
      undo: () => {
        if (pending) {
          return undefined
        }
        const entry = undo.at(-1)
        if (!entry) {
          return undefined
        }
        pending = {
          kind: 'undo',
          entryId: entry.id
        }
        return entry.inverse
      },
      redo: () => {
        if (pending) {
          return undefined
        }
        const entry = redo.at(-1)
        if (!entry) {
          return undefined
        }
        pending = {
          kind: 'redo',
          entryId: entry.id
        }
        return entry.forward
      },
      confirm: (options) => {
        if (!pending) {
          return false
        }

        const kind = pending.kind
        const source = kind === 'undo'
          ? undo
          : redo
        const entry = findEntry(source, pending.entryId)
        pending = null
        if (!entry) {
          return true
        }

        const footprint = options?.footprint ?? entry.footprint
        const baseSeq = options?.id
          ? readObservedSeqMax(clock)
          : entry.baseSeq

        if (options?.id) {
          observeChange(clock, options.id)
        }

        const nextEntry: HistoryEntry<Op, Key> = {
          ...entry,
          id: options?.id ?? entry.id,
          footprint,
          baseSeq,
          state: kind === 'undo'
            ? 'undone'
            : 'live'
        }

        if (source === undo) {
          undo = undo.filter((candidate) => candidate.id !== entry.id)
          redo = [...redo.filter((candidate) => candidate.id !== entry.id), {
            ...nextEntry,
            state: 'undone'
          }]
        } else {
          redo = redo.filter((candidate) => candidate.id !== entry.id)
          undo = trimUndo([...undo.filter((candidate) => candidate.id !== entry.id), {
            ...nextEntry,
            state: 'live'
          }], capacity)
        }

        return true
      },
      cancel: (mode = 'restore') => {
        if (!pending) {
          return false
        }

        const source = pending.kind === 'undo'
          ? undo
          : redo
        const entry = findEntry(source, pending.entryId)
        pending = null
        if (!entry) {
          return true
        }
        if (mode === 'invalidate') {
          ({
            undo,
            redo,
            invalidated
          } = moveToInvalidated({
            undo,
            redo,
            invalidated,
            entry
          }))
        }
        return true
      },
      clear: () => {
        if (!undo.length && !redo.length && !invalidated.length && !pending) {
          return false
        }
        undo = []
        redo = []
        invalidated = []
        pending = null
        return true
      }
    }
  },
  emptyState: (): HistoryState => ({ ...EMPTY_STATE })
} as const
