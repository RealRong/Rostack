import {
  impact
} from '@dataview/core/commit/impact'
import type {
  CommitImpact,
  DataDoc
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import {
  operation
} from '@dataview/core/operation'
import {
  deriveIndex
} from '@dataview/engine/active/index/runtime'
import {
  emptyNormalizedIndexDemand
} from '@dataview/engine/active/index/demand'
import type { ActiveRuntime } from '@dataview/engine/active/runtime/runtime'
import {
  createBaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import { createDocumentReadContext } from '@dataview/engine/document/reader'
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
  resolveViewPlan
} from '@dataview/engine/active/plan'
import type {
  CoreRuntime
} from '@dataview/engine/core/runtime'
import {
  createEngineSnapshot
} from '@dataview/engine/core/runtime'
import {
  projectDocumentDelta
} from '@dataview/engine/core/delta'
import type {
  ActionResult,
  CommitResult,
  CreatedEntities
} from '@dataview/engine/contracts'
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
import type {
  EngineState
} from '@dataview/engine/runtime/state'

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
      history: EngineState['history']
      impact: CommitImpact
      result: TResult
      planMs?: number
      ms?: number
    }

type Plan<TResult extends CommitResult = CommitResult> = (
  base: EngineState
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
  base: EngineState,
  kind: 'undo' | 'redo',
  operations: readonly DocumentOperation[],
  history: EngineState['history']
): Draft<CommitResult> => {
  const startedAt = now()
  const applied = operation.apply(base.doc, operations)

  return {
    ok: true,
    kind,
    doc: applied.document,
    history,
    impact: applied.impact,
    result: {
      issues: [],
      applied: true,
      summary: impact.summary(applied.impact)
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
  const applied = operation.apply(base.doc, batch.operations)
  const history = clearRedo(base.history)
  const nextHistory = base.history.capacity > 0
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
      summary: impact.summary(applied.impact),
      created: createdFromImpact(applied.impact)
    },
    planMs: batch.planMs,
    ms: now() - startedAt
  }
}

const replayPlan = (
  kind: 'undo' | 'redo',
  operations: readonly DocumentOperation[],
  history: EngineState['history']
): Plan<CommitResult> => base => replayResult(base, kind, operations, history)

const loadPlan = (
  doc: DataDoc
): Plan<CommitResult> => base => {
  const nextImpact = impact.reset(base.doc, doc)

  return {
    ok: true,
    kind: 'load',
    doc,
    history: clearHistory(base.history),
    impact: nextImpact,
    result: {
      issues: [],
      applied: true,
      summary: impact.summary(nextImpact)
    },
    ms: 0
  }
}

const commit = <TResult extends CommitResult>(input: {
  runtime: CoreRuntime
  activeRuntime: ActiveRuntime
  perf: PerformanceRuntime
  capturePerf: boolean
  plan: Plan<TResult>
}): TResult => {
  const base = input.runtime.state()
  const startedAt = now()
  const draft = input.plan(base)
  if (!draft.ok) {
    return draft.result
  }

  const documentContext = createDocumentReadContext(draft.doc)
  const previousPlan = base.active.plan
  const plan = resolveViewPlan(documentContext, documentContext.activeViewId)
  const baseImpact = createBaseImpact(draft.impact)
  const nextIndex = deriveIndex({
    previous: base.active.index,
    previousDemand: previousPlan?.index ?? emptyNormalizedIndexDemand(),
    document: draft.doc,
    impact: baseImpact,
    demand: plan?.index
  })
  const previousActive = input.runtime.result().snapshot.active
  const nextView = input.activeRuntime.update({
    read: {
      reader: documentContext.reader,
      fieldsById: documentContext.fieldsById
    },
    view: {
      plan,
      previousPlan
    },
    index: {
      state: nextIndex.state,
      ...(nextIndex.delta
        ? {
            delta: nextIndex.delta
          }
        : {})
    },
    impact: baseImpact
  })
  const outputStart = now()
  const nextState: EngineState = {
    rev: base.rev + 1,
    doc: draft.doc,
    history: draft.history,
    active: {
      ...(plan
        ? { plan }
        : {}),
      index: nextIndex.state
    }
  }
  const nextSnapshot = createEngineSnapshot({
    state: nextState,
    active: nextView.snapshot
  })
  const nextDocDelta = projectDocumentDelta({
    previous: base.doc,
    next: draft.doc,
    impact: draft.impact
  })
  const nextDelta = nextDocDelta || nextView.delta
    ? {
        ...(nextDocDelta
          ? {
              doc: nextDocDelta
            }
          : {}),
        ...(nextView.delta
          ? {
              active: nextView.delta
            }
          : {})
      }
    : undefined
  const outputMs = now() - outputStart
  const nextResult = {
    rev: nextState.rev,
    snapshot: nextSnapshot,
    ...(nextDelta
      ? {
          delta: nextDelta
        }
      : {})
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
        outputMs,
        snapshotMs: nextView.trace.snapshotMs
      },
      impact: summarizeImpact(draft.impact),
      index: nextIndex.trace,
      view: nextView.trace.view,
      snapshot: nextView.trace.snapshot
    })
  }

  input.runtime.commit({
    state: nextState,
    result: nextResult
  })
  return draft.result
}

export const createWriteControl = (input: {
  runtime: CoreRuntime
  activeRuntime: ActiveRuntime
  perf: PerformanceRuntime
  capturePerf: boolean
}) => {
  const runPlan = <TResult extends CommitResult>(
    plan: Plan<TResult>
  ) => commit({
    runtime: input.runtime,
    activeRuntime: input.activeRuntime,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan
  })

  return {
    run: (batch: PlannedWriteBatch): ActionResult => runPlan(writePlan(batch)),
    load: (doc: DataDoc): CommitResult => runPlan(loadPlan(doc)),
    history: createWriteHistory({
      runtime: input.runtime,
      replay: (
        kind: 'undo' | 'redo',
        operations: readonly DocumentOperation[],
        history: EngineState['history']
      ) => runPlan(replayPlan(kind, operations, history))
    })
  }
}
