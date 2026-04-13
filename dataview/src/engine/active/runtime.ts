import type {
  CommitDelta,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import { now } from '../runtime/clock'
import type { IndexState } from './index/types'
import type { ViewCache } from '../contracts/internal'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '../contracts/public'
import {
  emptyViewCache
} from '../contracts/internal'
import {
  deriveViewSnapshot
} from './snapshot/runtime'

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

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

export const createViewRuntime = (input: {
  doc: DataDoc
  index: IndexState
  delta: CommitDelta
  capturePerf: boolean
}): ViewRuntimeResult => deriveViewRuntime({
  previous: undefined,
  cache: emptyViewCache(),
  doc: input.doc,
  index: input.index,
  delta: input.delta,
  capturePerf: input.capturePerf
})

export const deriveViewRuntime = (input: {
  previous?: ViewState
  cache: ViewCache
  doc: DataDoc
  index: IndexState
  delta: CommitDelta
  capturePerf: boolean
}): ViewRuntimeResult => {
  const runResult = deriveViewSnapshot({
    document: input.doc,
    activeViewId: input.doc.activeViewId as ViewId | undefined,
    delta: input.delta,
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
