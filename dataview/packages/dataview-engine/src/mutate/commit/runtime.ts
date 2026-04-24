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
} from '@dataview/engine/contracts/result'
import type {
  EngineWrite
} from '@dataview/engine/contracts/write'
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
      origin: EngineWrite['origin']
      doc: DataDoc
      impact: CommitImpact
      forward: readonly DocumentOperation[]
      inverse: readonly DocumentOperation[]
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
  operations: readonly DocumentOperation[]
): Draft<CommitResult> => {
  const startedAt = now()
  const applied = operation.apply(base.doc, operations)

  return {
    ok: true,
    kind,
    origin: 'history',
    doc: applied.doc,
    impact: applied.extra.impact,
    forward: applied.forward,
    inverse: applied.inverse,
    result: {
      issues: [],
      applied: true,
      summary: impact.summary(applied.extra.impact)
    },
    ms: now() - startedAt
  }
}

const writePlan = (
  batch: PlannedWriteBatch,
  origin: EngineWrite['origin']
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

  return {
    ok: true,
    kind: 'write',
    origin,
    doc: applied.doc,
    impact: applied.extra.impact,
    forward: applied.forward,
    inverse: applied.inverse,
    result: {
      issues: batch.issues,
      applied: true,
      summary: impact.summary(applied.extra.impact),
      created: createdFromImpact(applied.extra.impact)
    },
    planMs: batch.planMs,
    ms: now() - startedAt
  }
}

const applyPlan = (
  operations: readonly DocumentOperation[],
  origin: EngineWrite['origin']
): Plan<CommitResult> => base => {
  if (!operations.length) {
    return {
      ok: false,
      result: {
        issues: [],
        applied: false
      }
    }
  }

  const startedAt = now()
  const applied = operation.apply(base.doc, operations)

  return {
    ok: true,
    kind: 'write',
    origin,
    doc: applied.doc,
    impact: applied.extra.impact,
    forward: applied.forward,
    inverse: applied.inverse,
    result: {
      issues: [],
      applied: true,
      summary: impact.summary(applied.extra.impact)
    },
    ms: now() - startedAt
  }
}

const replayPlan = (
  kind: 'undo' | 'redo',
  operations: readonly DocumentOperation[]
): Plan<CommitResult> => base => replayResult(base, kind, operations)

const loadPlan = (
  doc: DataDoc
): Plan<CommitResult> => base => {
  const nextImpact = impact.reset(base.doc, doc)

  return {
    ok: true,
    kind: 'load',
    origin: 'load',
    doc,
    impact: nextImpact,
    forward: [],
    inverse: [],
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
  writeListeners: Set<(write: EngineWrite) => void>
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
  const write: EngineWrite = {
    rev: nextState.rev,
    at: Date.now(),
    origin: draft.origin,
    doc: draft.doc,
    forward: draft.forward,
    inverse: draft.inverse,
    footprint: [],
    extra: {
      impact: draft.impact
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
  input.writeListeners.forEach((listener) => {
    listener(write)
  })
  return {
    ...draft.result,
    write
  } as TResult
}

export const createWriteControl = (input: {
  runtime: CoreRuntime
  activeRuntime: ActiveRuntime
  perf: PerformanceRuntime
  capturePerf: boolean
}) => {
  const writeListeners = new Set<(write: EngineWrite) => void>()
  const runPlan = <TResult extends CommitResult>(
    plan: Plan<TResult>
  ) => commit({
    runtime: input.runtime,
    activeRuntime: input.activeRuntime,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan,
    writeListeners
  })

  return {
    writes: {
      subscribe: (listener: (write: EngineWrite) => void) => {
        writeListeners.add(listener)
        return () => {
          writeListeners.delete(listener)
        }
      }
    },
    execute: (
      batch: PlannedWriteBatch,
      options?: {
        origin?: EngineWrite['origin']
      }
    ): ActionResult => runPlan(writePlan(batch, options?.origin ?? 'user')),
    apply: (
      operations: readonly DocumentOperation[],
      options?: {
        origin?: EngineWrite['origin']
      }
    ): CommitResult => runPlan(applyPlan(operations, options?.origin ?? 'user')),
    replay: (
      kind: 'undo' | 'redo',
      operations: readonly DocumentOperation[]
    ): CommitResult => runPlan(replayPlan(kind, operations)),
    load: (doc: DataDoc): CommitResult => runPlan(loadPlan(doc))
  }
}
