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
} from '../index/runtime'
import {
  deriveProject
} from '../project/runtime'
import type {
  ResolvedWriteBatch
} from '../command'
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
} from '../store/state'
import type {
  ActionResult,
  CommitResult,
  CreatedEntities
} from '../api/public'
import {
  clearHistory,
  clearRedo,
  createWriteHistory,
  pushUndo
} from './history'
import {
  summarizeDelta,
  toTraceKind
} from './trace'

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
  base: State,
  kind: 'undo' | 'redo',
  operations: readonly BaseOperation[],
  history: State['history']
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
  batch: ResolvedWriteBatch
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
  history: State['history']
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
    run: (batch: ResolvedWriteBatch): ActionResult => runPlan(writePlan(batch)),
    load: (doc: DataDoc): CommitResult => runPlan(loadPlan(doc)),
    history: createWriteHistory({
      store: input.store,
      replay: (kind, operations, history) => runPlan(replayPlan(kind, operations, history))
    })
  }
}
