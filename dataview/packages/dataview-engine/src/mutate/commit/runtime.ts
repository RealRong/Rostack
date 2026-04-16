import {
  createResetCommitImpact,
  summarizeCommitImpact
} from '@dataview/core/commit/impact'
import type {
  CommitImpact,
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
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
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'
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
  summarizeImpact,
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
      impact: CommitImpact
      result: TResult
      planMs?: number
      ms?: number
    }

type Plan<TResult extends CommitResult = CommitResult> = (
  base: EngineRuntimeState
) => Draft<TResult>

const toCreatedIds = <T extends string>(
  values?: ReadonlySet<T>
): readonly T[] | undefined => values?.size
  ? Array.from(values)
  : undefined

const createdFromImpact = (
  impact: CommitImpact
): CreatedEntities | undefined => {
  const created = {
    records: toCreatedIds(impact.records?.inserted),
    fields: toCreatedIds(impact.fields?.inserted),
    views: toCreatedIds(impact.views?.inserted)
  }

  return created.records?.length || created.fields?.length || created.views?.length
    ? created
    : undefined
}

const replayResult = (
  base: EngineRuntimeState,
  kind: 'undo' | 'redo',
  operations: readonly DocumentOperation[],
  history: EngineRuntimeState['history']
): Draft<CommitResult> => {
  const startedAt = now()
  const applied = applyOperations(base.doc, operations)

  return {
    ok: true,
    kind,
    doc: applied.document,
    history,
    impact: applied.impact,
    result: {
      issues: [],
      applied: true,
      summary: summarizeCommitImpact(applied.impact)
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
  const applied = applyOperations(base.doc, batch.operations)
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
    impact: applied.impact,
    result: {
      issues: batch.issues,
      applied: true,
      summary: summarizeCommitImpact(applied.impact),
      created: createdFromImpact(applied.impact)
    },
    planMs: batch.planMs,
    ms: now() - startedAt
  }
}

const replayPlan = (
  kind: 'undo' | 'redo',
  operations: readonly DocumentOperation[],
  history: EngineRuntimeState['history']
): Plan<CommitResult> => base => replayResult(base, kind, operations, history)

const loadPlan = (
  doc: DataDoc
): Plan<CommitResult> => base => {
  const impact = createResetCommitImpact(base.doc, doc)

  return {
    ok: true,
    kind: 'load',
    doc,
    history: clearHistory(base.history),
    impact,
    result: {
      issues: [],
      applied: true,
      summary: summarizeCommitImpact(impact)
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

  const documentContext = createStaticDocumentReadContext(draft.doc)
  const nextIndex = deriveIndex({
    previous: base.currentView.index,
    previousDemand: base.currentView.demand,
    document: draft.doc,
    impact: draft.impact,
    demand: resolveViewDemand(documentContext, documentContext.activeViewId)
  })
  const nextView = deriveViewRuntime({
    previous: base.currentView.snapshot,
    previousIndex: base.currentView.index,
    cache: base.currentView.cache,
    documentContext,
    index: nextIndex.state,
    impact: draft.impact,
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
        planMs: draft.planMs,
        commitMs: draft.ms,
        indexMs: nextIndex.trace.timings.totalMs,
        viewMs: nextView.trace.view.timings.totalMs,
        snapshotMs: nextView.trace.snapshotMs
      },
      impact: summarizeImpact(draft.impact),
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
        operations: readonly DocumentOperation[],
        history: EngineRuntimeState['history']
      ) => runPlan(replayPlan(kind, operations, history))
    })
  }
}
