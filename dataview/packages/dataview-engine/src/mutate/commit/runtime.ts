import {
  createDeltaCollector
} from '@dataview/core/commit/collector'
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
  applyOperations
} from '@dataview/core/operation'
import {
  deriveIndex
} from '@dataview/engine/active/index/runtime'
import {
  deriveViewRuntime
} from '@dataview/engine/active/runtime'
import type {
  PlannedWriteBatch
} from '@dataview/engine/mutate/planner'
import type {
  PerformanceRuntime
} from '@dataview/engine/runtime/performance'
import {
  now
} from '@dataview/engine/runtime/clock'
import {
  resolveViewDemand
} from '@dataview/engine/active/demand'
import type {
  EngineRuntimeState,
  RuntimeStore
} from '@dataview/engine/runtime/store'
import type {
  ActionResult,
  CommitResult,
  CreatedEntities
} from '@dataview/engine/contracts/public'
import {
  clearHistory,
  clearRedo,
  createWriteHistory,
  pushUndo
} from '@dataview/engine/runtime/history'
import {
  summarizeDelta,
  toTraceKind
} from '@dataview/engine/mutate/commit/trace'

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
      history: EngineRuntimeState['history']
      delta: NonNullable<CommitResult['changes']>
      result: TResult
      ms?: number
    }

type Plan<TResult extends CommitResult = CommitResult> = (
  base: EngineRuntimeState
) => Draft<TResult>

const createdFromChanges = (
  changes?: CommitResult['changes']
): CreatedEntities | undefined => {
  if (!changes) {
    return undefined
  }

  const created = {
    records: changes.entities.records?.add,
    fields: changes.entities.fields?.add,
    views: changes.entities.views?.add
  }

  return created.records?.length || created.fields?.length || created.views?.length
    ? created
    : undefined
}

const replayResult = (
  base: EngineRuntimeState,
  kind: 'undo' | 'redo',
  operations: readonly BaseOperation[],
  history: EngineRuntimeState['history']
): Draft<CommitResult> => {
  const startedAt = now()
  const applied = applyOperations(base.doc, operations)

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
  batch: PlannedWriteBatch
): Plan<ActionResult> => base => {
  if (!batch.canApply || !batch.operations.length) {
    return {
      ok: false,
      result: {
        issues: batch.issues,
        applied: false
      }
    }
  }

  const startedAt = now()
  const applied = applyOperations(
    base.doc,
    batch.operations,
    createDeltaCollector(base.doc, batch.deltaDraft)
  )
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

const replayPlan = (
  kind: 'undo' | 'redo',
  operations: readonly BaseOperation[],
  history: EngineRuntimeState['history']
): Plan<CommitResult> => base => replayResult(base, kind, operations, history)

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
  store: RuntimeStore
  perf: PerformanceRuntime
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
    previous: base.currentView.index,
    previousDemand: base.currentView.demand,
    document: draft.doc,
    delta: draft.delta,
    demand: resolveViewDemand(draft.doc, draft.doc.activeViewId)
  })
  const nextView = deriveViewRuntime({
    previous: base.currentView.snapshot,
    cache: base.currentView.cache,
    doc: draft.doc,
    index: nextIndex.state,
    delta: draft.delta,
    capturePerf: input.capturePerf
  })

  const next = {
    rev: base.rev + 1,
    doc: draft.doc,
    history: draft.history,
    currentView: {
      demand: nextIndex.demand,
      index: nextIndex.state,
      cache: nextView.cache,
      ...(nextView.snapshot
        ? { snapshot: nextView.snapshot }
        : {})
    }
  }

  if (
    input.perf.enabled
    && nextIndex.trace
    && nextView.trace
  ) {
    input.perf.recordCommit({
      kind: toTraceKind(draft.kind),
      timings: {
        totalMs: now() - startedAt,
        commitMs: draft.ms,
        indexMs: nextIndex.trace.timings.totalMs,
        viewMs: nextView.trace.view.timings.totalMs,
        snapshotMs: nextView.trace.snapshotMs
      },
      delta: summarizeDelta(draft.delta),
      index: nextIndex.trace,
      view: nextView.trace.view,
      snapshot: nextView.trace.snapshot
    })
  }

  input.store.set(next)
  return draft.result
}

export const createWriteControl = (input: {
  store: RuntimeStore
  perf: PerformanceRuntime
  capturePerf: boolean
}) => {
  const runPlan = <TResult extends CommitResult>(
    plan: Plan<TResult>
  ) => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan
  })

  return {
    run: (batch: PlannedWriteBatch): ActionResult => runPlan(writePlan(batch)),
    load: (doc: DataDoc): CommitResult => runPlan(loadPlan(doc)),
    history: createWriteHistory({
      store: input.store,
      replay: (
        kind: 'undo' | 'redo',
        operations: readonly BaseOperation[],
        history: EngineRuntimeState['history']
      ) => runPlan(replayPlan(kind, operations, history))
    })
  }
}
