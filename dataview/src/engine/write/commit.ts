import {
  createResetDelta
} from '@dataview/core/commit/delta'
import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  BaseOperation
} from '@dataview/core/contracts/operations'
import {
  deriveIndex
} from '../derive/index'
import {
  deriveProject
} from '../derive/project'
import type {
  ResolvedWriteBatch
} from '../command'
import type {
  HistoryState
} from '../history'
import type {
  PerfRuntime
} from '../perf/runtime'
import {
  now
} from '../perf/shared'
import {
  resolveIndexDemand
} from '../project/runtime/demand'
import type {
  State,
  Store
} from '../state'
import type {
  CommandResult,
  CommitResult,
  TraceDeltaSummary
} from '../types'
import {
  applyReplay,
  applyWriteBatch,
  createdFromChanges,
  emptyResult,
  rejectedResult
} from './apply'

type Kind =
  | 'write'
  | 'undo'
  | 'redo'
  | 'load'

type Draft<TResult extends CommitResult = CommitResult> =
  | {
      ok: false
      result: TResult
    }
  | {
      ok: true
      kind: Kind
      doc: DataDoc
      history: State['history']
      delta: NonNullable<CommitResult['changes']>
      result: TResult
      ms?: number
    }

type Plan<TResult extends CommitResult = CommitResult> = (
  base: State
) => Draft<TResult>

const trimUndo = (
  entries: State['history']['undo'],
  cap: number
) => {
  if (!cap) {
    return []
  }
  if (entries.length <= cap) {
    return entries
  }
  return entries.slice(entries.length - cap)
}

const clearHistory = (
  history: State['history']
): State['history'] => ({
  ...history,
  undo: [],
  redo: []
})

const clearRedo = (
  history: State['history']
): State['history'] => (
  history.redo.length
    ? {
        ...history,
        redo: []
      }
    : history
)

const pushUndo = (
  history: State['history'],
  entry: State['history']['undo'][number]
): State['history'] => ({
  ...history,
  undo: trimUndo([...history.undo, entry], history.cap)
})

const takeUndo = (history: State['history']): {
  history: State['history']
  operations?: BaseOperation[]
} => {
  const entry = history.undo.at(-1)
  if (!entry) {
    return {
      history
    }
  }

  return {
    history: {
      ...history,
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, entry]
    },
    operations: entry.undo
  }
}

const takeRedo = (history: State['history']): {
  history: State['history']
  operations?: BaseOperation[]
} => {
  const entry = history.redo.at(-1)
  if (!entry) {
    return {
      history
    }
  }

  return {
    history: {
      ...history,
      undo: trimUndo([...history.undo, entry], history.cap),
      redo: history.redo.slice(0, -1)
    },
    operations: entry.redo
  }
}

const historyState = (
  history: State['history']
): HistoryState => ({
  capacity: history.cap,
  undoDepth: history.undo.length,
  redoDepth: history.redo.length
})

const canUndo = (
  history: State['history']
) => history.undo.length > 0

const canRedo = (
  history: State['history']
) => history.redo.length > 0

const touchedCount = (
  all: boolean,
  ids: readonly string[]
): number | 'all' | undefined => {
  if (all) {
    return 'all'
  }
  return ids.length
    ? new Set(ids).size
    : undefined
}

const summarizeDelta = (
  delta: NonNullable<CommitResult['changes']>
): TraceDeltaSummary => {
  const semantics = new Map<string, number>()
  delta.semantics.forEach(item => {
    semantics.set(item.kind, (semantics.get(item.kind) ?? 0) + 1)
  })

  return {
    summary: {
      ...delta.summary
    },
    semantics: Array.from(semantics.entries()).map(([kind, count]) => ({
      kind,
      ...(count > 1 ? { count } : {})
    })),
    entities: {
      touchedRecordCount: touchedCount(
        delta.entities.records?.update === 'all'
        || delta.entities.values?.records === 'all',
        [
          ...(delta.entities.records?.add ?? []),
          ...(Array.isArray(delta.entities.records?.update) ? delta.entities.records.update : []),
          ...(delta.entities.records?.remove ?? []),
          ...(Array.isArray(delta.entities.values?.records) ? delta.entities.values.records : [])
        ]
      ),
      touchedFieldCount: touchedCount(
        delta.entities.fields?.update === 'all'
        || delta.entities.values?.fields === 'all',
        [
          ...(delta.entities.fields?.add ?? []),
          ...(Array.isArray(delta.entities.fields?.update) ? delta.entities.fields.update : []),
          ...(delta.entities.fields?.remove ?? []),
          ...(Array.isArray(delta.entities.values?.fields) ? delta.entities.values.fields : [])
        ]
      ),
      touchedViewCount: touchedCount(
        delta.entities.views?.update === 'all',
        [
          ...(delta.entities.views?.add ?? []),
          ...(Array.isArray(delta.entities.views?.update) ? delta.entities.views.update : []),
          ...(delta.entities.views?.remove ?? [])
        ]
      )
    }
  }
}

const toTraceKind = (
  kind: Kind
): 'dispatch' | 'undo' | 'redo' | 'replace' => {
  switch (kind) {
    case 'write':
      return 'dispatch'
    case 'undo':
      return 'undo'
    case 'redo':
      return 'redo'
    case 'load':
      return 'replace'
  }
}

const replayResult = (
  base: State,
  kind: 'undo' | 'redo',
  operations: readonly BaseOperation[],
  history: State['history']
): Draft<CommitResult> => {
  const startedAt = now()
  const applied = applyReplay(base.doc, operations)

  return {
    ok: true,
    kind,
    doc: applied.document,
    history,
    delta: applied.delta,
    result: {
      issues: [],
      applied: true,
      changes: applied.delta
    },
    ms: now() - startedAt
  }
}

const writePlan = (
  batch: ResolvedWriteBatch
): Plan<CommandResult> => base => {
  if (!batch.canApply || !batch.operations.length) {
    return {
      ok: false,
      result: rejectedResult(batch.issues)
    }
  }

  const startedAt = now()
  const applied = applyWriteBatch(base.doc, batch)
  const history = clearRedo(base.history)
  const nextHistory = base.history.cap > 0
    ? pushUndo(history, {
        undo: applied.undo,
        redo: applied.redo
      })
    : history

  return {
    ok: true,
    kind: 'write',
    doc: applied.document,
    history: nextHistory,
    delta: applied.delta,
    result: {
      issues: batch.issues,
      applied: true,
      changes: applied.delta,
      created: createdFromChanges(applied.delta)
    },
    ms: now() - startedAt
  }
}

const undoPlan = (): Plan<CommitResult> => base => {
  const replay = takeUndo(base.history)
  if (!replay.operations) {
    return {
      ok: false,
      result: emptyResult()
    }
  }

  return replayResult(base, 'undo', replay.operations, replay.history)
}

const redoPlan = (): Plan<CommitResult> => base => {
  const replay = takeRedo(base.history)
  if (!replay.operations) {
    return {
      ok: false,
      result: emptyResult()
    }
  }

  return replayResult(base, 'redo', replay.operations, replay.history)
}

const loadPlan = (
  doc: DataDoc
): Plan<CommitResult> => base => {
  const delta = createResetDelta(base.doc, doc)

  return {
    ok: true,
    kind: 'load',
    doc,
    history: clearHistory(base.history),
    delta,
    result: {
      issues: [],
      applied: true,
      changes: delta
    },
    ms: 0
  }
}

const commit = <TResult extends CommitResult>(input: {
  store: Store
  perf: PerfRuntime
  capturePerf: boolean
  plan: Plan<TResult>
}): TResult => {
  const base = input.store.get()
  const startedAt = now()
  const draft = input.plan(base)
  if (!draft.ok) {
    return draft.result
  }

  const nextIndex = deriveIndex({
    previous: base.index,
    previousDemand: base.cache.indexDemand,
    document: draft.doc,
    delta: draft.delta,
    demand: resolveIndexDemand(draft.doc, draft.doc.activeViewId)
  })
  const nextProject = deriveProject({
    previous: base.project,
    projection: base.cache.projection,
    doc: draft.doc,
    index: nextIndex.state,
    delta: draft.delta,
    capturePerf: input.capturePerf
  })

  const next: State = {
    rev: base.rev + 1,
    doc: draft.doc,
    history: draft.history,
    index: nextIndex.state,
    project: nextProject.state,
    cache: {
      indexDemand: nextIndex.demand,
      projection: nextProject.projection
    }
  }

  if (
    input.perf.enabled
    && nextIndex.trace
    && nextProject.trace
  ) {
    input.perf.recordCommit({
      kind: toTraceKind(draft.kind),
      timings: {
        totalMs: now() - startedAt,
        commitMs: draft.ms,
        indexMs: nextIndex.trace.timings.totalMs,
        projectMs: nextProject.trace.project.timings.totalMs,
        publishMs: nextProject.trace.publishMs
      },
      delta: summarizeDelta(draft.delta),
      index: nextIndex.trace,
      project: nextProject.trace.project,
      publish: nextProject.trace.publish
    })
  }

  input.store.set(next)
  return draft.result
}

export const createWriteControl = (input: {
  store: Store
  perf: PerfRuntime
  capturePerf: boolean
}) => ({
  run: (batch: ResolvedWriteBatch): CommandResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: writePlan(batch)
  }),
  undo: (): CommitResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: undoPlan()
  }),
  redo: (): CommitResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: redoPlan()
  }),
  load: (doc: DataDoc): CommitResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: loadPlan(doc)
  }),
  history: {
    state: () => historyState(input.store.get().history),
    canUndo: () => canUndo(input.store.get().history),
    canRedo: () => canRedo(input.store.get().history),
    clear: () => {
      const current = input.store.get()
      if (!current.history.undo.length && !current.history.redo.length) {
        return
      }

      input.store.set({
        ...current,
        history: clearHistory(current.history)
      })
    }
  }
})
