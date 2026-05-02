import type {
  DataDoc,
  ViewId
} from '@dataview/core/types'
import {
  createDataviewQueryContext,
  type DataviewMutationDelta,
  type DataviewQueryContext
} from '@dataview/core/mutation'
import {
  createProjection,
  type ProjectionStoreTree
} from '@shared/projection'
import type {
  ProjectionPhaseTable
} from '@shared/projection/createProjection'
import {
  createDataviewFrame
} from '@dataview/engine/active/frame'
import {
  createDataviewActivePlan
} from '@dataview/engine/active/plan'
import {
  createDataviewActiveState,
  runDataviewActive
} from '@dataview/engine/active/runtime'
import type {
  DataviewState
} from '@dataview/engine/active/state'
import {
  ensureDataviewIndex
} from '@dataview/engine/active/index/runtime'
import type {
  IndexTrace,
  SnapshotTrace,
  ViewTrace
} from '@dataview/engine/contracts/performance'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

export type DataviewProjectionPhaseName = 'active'

export interface DataviewProjectionInput {
  document: DataDoc
  delta: DataviewMutationDelta
}

export interface DataviewProjectionOutput {
  activeId?: ViewId
  active?: ViewState
}

export interface DataviewProjectionRead {
  document: {
    current(): DataDoc | undefined
    query(): DataviewQueryContext | undefined
  }
  active: {
    id(): ViewId | undefined
    state(): DataviewState['active']
    snapshot(): ViewState | undefined
  }
  index: {
    state(): DataviewState['active']['index']
    trace(): IndexTrace | undefined
  }
  publish: {
    snapshotTrace(): SnapshotTrace
    viewTrace(totalMs?: number): ViewTrace
    activeTrace(totalMs?: number): {
      view: ViewTrace
      snapshot: SnapshotTrace
      snapshotMs: number
    }
  }
}

const EMPTY_SNAPSHOT_TRACE: SnapshotTrace = {
  storeCount: 0,
  changedStores: []
}

const buildViewTrace = (input: {
  state: DataviewState
  totalMs: number
}): ViewTrace => {
  const trace = input.state.active.trace
  return {
    plan: {
      query: trace.query.action,
      membership: trace.membership.action,
      summary: trace.summary.action,
      publish: trace.publish.action
    },
    timings: {
      totalMs: input.totalMs
    },
    stages: [{
      stage: 'query',
      action: trace.query.action,
      executed: true,
      changed: trace.query.changed,
      durationMs: trace.query.deriveMs + trace.query.publishMs,
      deriveMs: trace.query.deriveMs,
      publishMs: trace.query.publishMs,
      ...(trace.query.metrics
        ? { metrics: trace.query.metrics }
        : {})
    }, {
      stage: 'membership',
      action: trace.membership.action,
      executed: true,
      changed: trace.membership.changed,
      durationMs: trace.membership.deriveMs + trace.membership.publishMs,
      deriveMs: trace.membership.deriveMs,
      publishMs: trace.membership.publishMs,
      ...(trace.membership.metrics
        ? { metrics: trace.membership.metrics }
        : {})
    }, {
      stage: 'summary',
      action: trace.summary.action,
      executed: true,
      changed: trace.summary.changed,
      durationMs: trace.summary.deriveMs + trace.summary.publishMs,
      deriveMs: trace.summary.deriveMs,
      publishMs: trace.summary.publishMs,
      ...(trace.summary.metrics
        ? { metrics: trace.summary.metrics }
        : {})
    }, {
      stage: 'publish',
      action: trace.publish.action,
      executed: true,
      changed: trace.publish.changed,
      durationMs: trace.publish.deriveMs + trace.publish.publishMs,
      deriveMs: trace.publish.deriveMs,
      publishMs: trace.publish.publishMs,
      ...(trace.publish.metrics
        ? { metrics: trace.publish.metrics }
        : {})
    }]
  }
}

const createState = (): DataviewState => ({
  revision: 0,
  active: createDataviewActiveState()
})

const didActiveChange = (
  state: DataviewState
): boolean => state.active.changes.active !== 'skip'
  || state.active.changes.fields !== 'skip'
  || state.active.changes.sections !== 'skip'
  || state.active.changes.items !== 'skip'
  || state.active.changes.summaries !== 'skip'

export const createDataviewProjectionRead = (runtime: {
  state: () => DataviewState
}): DataviewProjectionRead => ({
  document: {
    current: () => runtime.state().document?.current,
    query: () => runtime.state().document?.query
  },
  active: {
    id: () => runtime.state().active.spec?.id,
    state: () => runtime.state().active,
    snapshot: () => runtime.state().active.snapshot
  },
  index: {
    state: () => runtime.state().active.index,
    trace: () => runtime.state().active.index?.trace
  },
  publish: {
    snapshotTrace: () => runtime.state().active.trace.snapshot,
    viewTrace: (totalMs = 0) => buildViewTrace({
      state: runtime.state(),
      totalMs
    }),
    activeTrace: (totalMs = 0) => ({
      view: buildViewTrace({
        state: runtime.state(),
        totalMs
      }),
      snapshot: runtime.state().active.trace.snapshot,
      snapshotMs: runtime.state().active.trace.publish.publishMs
    })
  }
})

export const createDataviewProjection = () => createProjection({
  createState,
  createRead: createDataviewProjectionRead,
  capture: ({ read }) => ({
    activeId: read.active.id(),
    active: read.active.snapshot()
  }),
  stores: {
    active: {
      kind: 'value' as const,
      read: (state: DataviewState) => state.active.snapshot,
      change: (state: DataviewState) => state.active.changes.active
    },
    fields: {
      kind: 'family' as const,
      read: (state: DataviewState) => state.active.fields,
      change: (state: DataviewState) => state.active.changes.fields
    },
    sections: {
      kind: 'family' as const,
      read: (state: DataviewState) => state.active.sections,
      change: (state: DataviewState) => state.active.changes.sections
    },
    items: {
      kind: 'family' as const,
      read: (state: DataviewState) => state.active.items,
      change: (state: DataviewState) => state.active.changes.items
    },
    summaries: {
      kind: 'family' as const,
      read: (state: DataviewState) => state.active.summaries,
      change: (state: DataviewState) => state.active.changes.summaries
    }
  } satisfies ProjectionStoreTree<DataviewState>,
  plan: () => ({
    phases: ['active']
  }),
  phases: ({
    active: (ctx) => {
      const query = createDataviewQueryContext(ctx.input.document)
      ctx.state.document = {
        current: ctx.input.document,
        query
      }
      const frame = createDataviewFrame({
        revision: ctx.revision,
        document: ctx.input.document,
        delta: ctx.input.delta
      })
      const index = ensureDataviewIndex({
        frame,
        previous: ctx.read.index.state()
      })
      const nextActive = runDataviewActive({
        frame,
        plan: createDataviewActivePlan({
          frame,
          previous: ctx.read.active.state(),
          index
        }),
        index,
        previous: ctx.read.active.state()
      })

      ctx.state.revision = ctx.revision
      ctx.state.active = nextActive
      if (didActiveChange(ctx.state)) {
        ctx.phase.active.changed = true
      }
    }
  }) satisfies ProjectionPhaseTable<
    DataviewProjectionInput,
    DataviewState,
    DataviewProjectionRead,
    DataviewProjectionPhaseName
  >
})
