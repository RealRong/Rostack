import { now } from '@dataview/engine/runtime/clock'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { ViewCache } from '@dataview/engine/contracts/state'
import type {
  ViewRuntimeResult
} from '@dataview/engine/contracts/runtime'
import type {
  SnapshotTrace,
  ViewState
} from '@dataview/engine/contracts'
import {
  emptyViewCache
} from '@dataview/engine/contracts/state'
import {
  deriveViewSnapshot
} from '@dataview/engine/active/snapshot/runtime'
import type {
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import type {
  DocumentReadContext
} from '@dataview/engine/document/reader'

const SNAPSHOT_KEYS = [
  'view',
  'query',
  'records',
  'sections',
  'items',
  'fields',
  'table',
  'gallery',
  'kanban',
  'summaries'
] as const satisfies readonly (keyof ViewState)[]

const createSnapshotTrace = (
  previous: ViewState | undefined,
  next: ViewState | undefined
): SnapshotTrace => ({
  storeCount: SNAPSHOT_KEYS.length,
  changedStores: next
    ? SNAPSHOT_KEYS.flatMap(key => Object.is(previous?.[key], next[key])
      ? []
      : [key])
    : previous
      ? [...SNAPSHOT_KEYS]
      : []
})

export const createViewRuntime = (input: {
  documentContext: DocumentReadContext
  viewPlan?: ViewPlan
  index: IndexState
  impact: BaseImpact
  capturePerf: boolean
}): ViewRuntimeResult => deriveViewRuntime({
  previous: undefined,
  cache: emptyViewCache(),
  documentContext: input.documentContext,
  viewPlan: input.viewPlan,
  index: input.index,
  impact: input.impact,
  capturePerf: input.capturePerf
})

export const deriveViewRuntime = (input: {
  previous?: ViewState
  cache: ViewCache
  documentContext: DocumentReadContext
  viewPlan?: ViewPlan
  previousPlan?: ViewPlan
  index: IndexState
  indexDelta?: IndexDelta
  impact: BaseImpact
  capturePerf: boolean
}): ViewRuntimeResult => {
  const runResult = deriveViewSnapshot({
    documentContext: input.documentContext,
    viewPlan: input.viewPlan,
    previousPlan: input.previousPlan,
    impact: input.impact,
    index: input.index,
    indexDelta: input.indexDelta,
    previousCache: input.cache,
    previousSnapshot: input.previous,
    capturePerf: input.capturePerf
  })

  if (!input.capturePerf || !runResult.trace) {
    return {
      cache: runResult.cache,
      snapshot: runResult.snapshot,
      ...(runResult.change
        ? {
            change: runResult.change
          }
        : {})
    }
  }

  const snapshotStart = now()
  const snapshot = createSnapshotTrace(input.previous, runResult.snapshot)

  return {
    cache: runResult.cache,
    snapshot: runResult.snapshot,
    ...(runResult.change
      ? {
          change: runResult.change
        }
      : {}),
    trace: {
      view: runResult.trace,
      snapshot,
      snapshotMs: now() - snapshotStart
    }
  }
}
