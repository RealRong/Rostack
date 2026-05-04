import type {
  DataDoc,
  ViewId
} from '@dataview/core/types'
import {
  type DataviewMutationChange,
} from '@dataview/core/mutation'
import {
  createProjection,
  type ProjectionStoreTree
} from '@shared/projection'
import type {
  ProjectionPhaseTable
} from '@shared/projection/createProjection'
import {
  createDataviewFrame,
  createDataviewResolvedContext,
  type DataviewResolvedContext
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
  ViewState
} from '@dataview/engine/contracts/view'

export type DataviewProjectionPhaseName = 'active'

export interface DataviewProjectionInput {
  document: DataDoc
  change: DataviewMutationChange
}

export interface DataviewProjectionOutput {
  activeId?: ViewId
  active?: ViewState
}

export interface DataviewProjectionRead {
  document: {
    current(): DataDoc | undefined
    query(): DataviewResolvedContext | undefined
  }
  active: {
    id(): ViewId | undefined
    state(): DataviewState['active']
    snapshot(): ViewState | undefined
  }
  index: {
    state(): DataviewState['active']['index']
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
    state: () => runtime.state().active.index
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
      const query = createDataviewResolvedContext(ctx.input.document)
      ctx.state.document = {
        current: ctx.input.document,
        query
      }
      const frame = createDataviewFrame({
        revision: ctx.revision,
        document: ctx.input.document,
        change: ctx.input.change
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
