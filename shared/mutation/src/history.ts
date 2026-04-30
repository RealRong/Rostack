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

type HistoryEntry<Program, Footprint> = {
  id: string
  applied: Program
  inverse: Program
  footprint: readonly Footprint[]
  baseSeq: number
  state: 'live' | 'undone' | 'invalidated'
}

export interface CaptureOptions<Footprint> {
  id?: string
  footprint?: readonly Footprint[]
}

export interface HistoryController<
  Program,
  Footprint,
  Commit extends ApplyCommit<any, any, Footprint, any>
> {
  state(): HistoryState
  capture(commit: Commit, options?: CaptureOptions<Footprint>): boolean
  observe(changeId: string, footprint: readonly Footprint[]): boolean
  undo(): Program | undefined
  redo(): Program | undefined
  confirm(options?: CaptureOptions<Footprint>): boolean
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

const findEntry = <Program, Footprint>(
  entries: readonly HistoryEntry<Program, Footprint>[],
  entryId: string
): HistoryEntry<Program, Footprint> | undefined => entries.find((entry) => entry.id === entryId)

const trimUndo = <Program, Footprint>(
  entries: HistoryEntry<Program, Footprint>[],
  capacity: number
): HistoryEntry<Program, Footprint>[] => {
  if (capacity <= 0) {
    return []
  }
  if (entries.length <= capacity) {
    return entries
  }
  return entries.slice(entries.length - capacity)
}

const moveToInvalidated = <Program, Footprint>(input: {
  undo: HistoryEntry<Program, Footprint>[]
  redo: HistoryEntry<Program, Footprint>[]
  invalidated: HistoryEntry<Program, Footprint>[]
  entry: HistoryEntry<Program, Footprint>
}) => {
  const next: HistoryEntry<Program, Footprint> = {
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
    Program,
    Footprint,
    Commit extends ApplyCommit<any, any, Footprint, any>
  >(input: {
    conflicts(
      left: readonly Footprint[],
      right: readonly Footprint[]
    ): boolean
    track?(commit: Commit): boolean
    capacity?: number
  }): HistoryController<Program, Footprint, Commit> {
    let nextEntryId = 1
    let undo: HistoryEntry<Program, Footprint>[] = []
    let redo: HistoryEntry<Program, Footprint>[] = []
    let invalidated: HistoryEntry<Program, Footprint>[] = []
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
        if (
          commit.applied.steps.length === 0
          || commit.inverse.steps.length === 0
        ) {
          return false
        }

        const footprint = options?.footprint ?? commit.footprint
        const entry: HistoryEntry<Program, Footprint> = {
          id: options?.id ?? `history_${nextEntryId++}`,
          applied: commit.applied as Program,
          inverse: commit.inverse as Program,
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
        return entry.applied
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

        const nextEntry: HistoryEntry<Program, Footprint> = {
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
