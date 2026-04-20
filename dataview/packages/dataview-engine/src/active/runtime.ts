import { now } from '@dataview/engine/runtime/clock'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'
import type { ViewCache } from '@dataview/engine/contracts/internal'
import type {
  ViewRuntimeResult
} from '@dataview/engine/contracts/runtime'
import type {
  SnapshotTrace,
  ViewState
} from '@dataview/engine/contracts/public'
import {
  emptyViewCache
} from '@dataview/engine/contracts/internal'
import {
  deriveViewSnapshot
} from '@dataview/engine/active/snapshot/runtime'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
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
  impact: ActiveImpact
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
  index: IndexState
  impact: ActiveImpact
  capturePerf: boolean
}): ViewRuntimeResult => {
  const runResult = deriveViewSnapshot({
    documentContext: input.documentContext,
    viewPlan: input.viewPlan,
    impact: input.impact,
    index: input.index,
    previousCache: input.cache,
    previousSnapshot: input.previous,
    capturePerf: input.capturePerf
  })

  if (!input.capturePerf || !runResult.trace) {
    return {
      cache: runResult.cache,
      snapshot: runResult.snapshot
    }
  }

  const snapshotStart = now()
  const snapshot = createSnapshotTrace(input.previous, runResult.snapshot)

  return {
    cache: runResult.cache,
    snapshot: runResult.snapshot,
    trace: {
      view: runResult.trace,
      snapshot,
      snapshotMs: now() - snapshotStart
    }
  }
}
