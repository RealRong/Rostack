import type {
  CommitDelta,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import { now } from '#engine/runtime/clock.ts'
import type { IndexState } from '#engine/active/index/contracts.ts'
import type { ViewCache } from '#engine/contracts/internal.ts'
import type {
  ViewRuntimeResult
} from '#engine/contracts/runtime.ts'
import type {
  SnapshotTrace,
  ViewState
} from '#engine/contracts/public.ts'
import {
  emptyViewCache
} from '#engine/contracts/internal.ts'
import {
  deriveViewSnapshot
} from '#engine/active/snapshot/runtime.ts'

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
