import type {
  DataDoc,
  ViewId
} from '@dataview/core/types'
import {
  createProjection,
  type ProjectionPhaseTable,
  type ProjectionStoreTree
} from '@shared/projection'
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
  DataviewMutationDelta
} from '@dataview/engine/mutation/delta'
import type {
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

export const createDataviewProjection = () => createProjection({
  createState,
  createRead: (runtime) => ({
    activeId: () => runtime.state().active.spec?.id,
    active: () => runtime.state().active.snapshot,
    indexState: () => runtime.state().active.index?.state,
    indexTrace: () => runtime.state().active.index?.trace,
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
  }),
  capture: ({ state }) => ({
    activeId: state.active.spec?.id,
    active: state.active.snapshot
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
      const frame = createDataviewFrame({
        revision: ctx.revision,
        document: ctx.input.document,
        delta: ctx.input.delta
      })
      const index = ensureDataviewIndex({
        frame,
        previous: ctx.state.active.index
      })
      const nextActive = runDataviewActive({
        frame,
        plan: createDataviewActivePlan({
          frame,
          previous: ctx.state.active,
          index
        }),
        index,
        previous: ctx.state.active
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
    DataviewProjectionPhaseName
  >
})
