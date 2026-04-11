import {
  createTraceDeltaSummary
} from '../runtime/commit/trace'
import {
  deriveIndex
} from '../derive/index'
import {
  deriveProject
} from '../derive/project'
import type {
  PerfRuntime
} from '../perf/runtime'
import {
  resolveIndexDemand
} from '../project/runtime/demand'
import type {
  State
} from '../state'
import type {
  Store
} from '../state/store'
import type {
  CommitResult
} from '../types'
import type {
  Draft,
  Plan
} from './plan'
import {
  now
} from '../perf/shared'

const toTraceKind = (
  kind: Extract<Draft<CommitResult>, { ok: true }>['kind']
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

export const commit = <TResult extends CommitResult>(input: {
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
      delta: createTraceDeltaSummary(draft.delta),
      index: nextIndex.trace,
      project: nextProject.trace.project,
      publish: nextProject.trace.publish
    })
  }

  input.store.set(next)
  return draft.result
}
