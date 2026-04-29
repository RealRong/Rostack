import {
  createProjection,
  type ProjectionContext,
} from '@shared/projection'
import type {
  ProjectionDirty,
  ProjectionPhaseTable
} from '@shared/projection/createProjection'
import type {
  Input,
  NodeCapabilityInput,
  SceneViewInput,
  EditorSceneLayout
} from '../contracts/editor'
import {
  createItemsDelta,
  renderChange,
  uiChange,
  resetDocumentDelta,
  resetGraphDelta
} from '../contracts/delta'
import type {
  WorkingState
} from '../contracts/working'
import {
  executionScopeHasAny
} from '../contracts/execution'
import type { SceneItemKey } from '../contracts/delta'
import { patchGraphState } from '../model/graph/patch'
import { patchDocumentState } from '../model/document/patch'
import { patchItemsState } from '../model/items/patch'
import { patchRenderState } from '../model/render/patch'
import { patchSpatial } from '../model/spatial/update'
import { resetSpatialDelta } from '../model/spatial/update'
import { patchUiState } from '../model/ui/patch'
import { createEditorSceneRead } from './read'
import { buildEditorSceneCapture } from './capture'
import { createWhiteboardExecution } from './execution'
import { editorSceneStores } from './stores'
import { createWorking } from './state'

export type EditorScenePhaseName =
  | 'document'
  | 'graph'
  | 'spatial'
  | 'items'
  | 'ui'
  | 'render'

type EditorSceneProjectionDirty = ProjectionDirty & {
  previousDocument?: WorkingState['document']['snapshot']
}

const readProjectionDirty = (
  context: ProjectionContext<Input, WorkingState, EditorScenePhaseName>
): EditorSceneProjectionDirty => context.dirty as EditorSceneProjectionDirty

const resetGraphPhaseDelta = (
  state: WorkingState
) => {
  resetGraphDelta(state.delta.graph)
}

const resetDocumentPhaseDelta = (
  state: WorkingState
) => {
  resetDocumentDelta(state.delta.document)
}

const resetItemsPhaseDelta = (
  state: WorkingState
) => {
  state.delta.items = createItemsDelta()
}

const resetUiPhaseDelta = (
  state: WorkingState
) => {
  state.delta.ui = uiChange.create()
}

const resetRenderPhaseDelta = (
  state: WorkingState
) => {
  state.delta.render = renderChange.create()
}

const collectItemChangeScope = (
  state: WorkingState
): WorkingState['execution']['items'] => {
  const change = state.delta.items.change
  if (!change) {
    return new Set<SceneItemKey>()
  }

  return new Set<SceneItemKey>([
    ...(change.set ?? []),
    ...(change.remove ?? [])
  ])
}

const toDocumentSnapshot = (
  input: Input['document']
) => ({
  revision: input.rev,
  document: input.doc
})

export const createEditorSceneProjection = (input: {
  layout?: EditorSceneLayout
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}) => createProjection({
  createState: () => createWorking({
    layout: input.layout
  }),
  createRead: (runtime) => createEditorSceneRead({
    revision: runtime.revision,
    state: runtime.state,
    items: () => runtime.state().items,
    spatial: () => runtime.state().spatial,
    nodeCapability: input.nodeCapability,
    view: input.view
  }),
  capture: ({ state, revision }) => buildEditorSceneCapture(
    state,
    revision
  ),
  stores: editorSceneStores,
  phases: {
    document: (ctx) => {
      const dirty = readProjectionDirty(ctx)
      const previousDocumentRevision = ctx.state.revision.document
      const previousBackground = ctx.state.document.background

      dirty.previousDocument = ctx.state.document.snapshot
      resetDocumentPhaseDelta(ctx.state)

      patchDocumentState({
        current: ctx.input,
        working: ctx.state,
        reset: ctx.dirty.reset
      })
      ctx.state.execution = createWhiteboardExecution(ctx.input)

      if (
        ctx.revision === 1
        || previousDocumentRevision !== ctx.input.document.rev
      ) {
        ctx.state.delta.document.revision = true
        ctx.phase.document.changed = true
      }

      if (
        ctx.revision === 1
        || previousBackground !== ctx.state.document.background
      ) {
        ctx.state.delta.document.background = true
        ctx.phase.document.changed = true
      }
    },
    graph: {
      after: ['document'],
      run: (ctx) => {
        const dirty = readProjectionDirty(ctx)

        const result = patchGraphState({
          revision: ctx.revision,
          current: ctx.input,
          execution: ctx.state.execution,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset,
          previousDocument: dirty.previousDocument
        })
        if (!result.ran) {
          resetGraphPhaseDelta(ctx.state)
          return
        }

        const graphChanged = (
          result.count > 0
          || ctx.revision === 1
          || ctx.state.delta.graph.order
        )
        if (graphChanged) {
          ctx.phase.graph.changed = true
        }
      }
    },
    spatial: {
      after: ['graph'],
      run: (ctx) => {
        if (
          !(
            ctx.revision === 1
            || ctx.state.execution.reset
            || ctx.state.execution.order
            || executionScopeHasAny(ctx.state.execution.graph.node.geometry)
            || executionScopeHasAny(ctx.state.execution.graph.edge.geometry)
            || executionScopeHasAny(ctx.state.execution.graph.mindmap.geometry)
            || executionScopeHasAny(ctx.state.execution.graph.group.geometry)
          )
        ) {
          resetSpatialDelta(ctx.state.delta.spatial)
          return
        }

        const result = patchSpatial({
          revision: ctx.revision,
          graph: ctx.state.graph,
          snapshot: toDocumentSnapshot(ctx.input.document),
          graphDelta: ctx.state.delta.graph,
          state: ctx.state.spatial,
          reset: ctx.revision === 1 || ctx.state.execution.reset,
          delta: ctx.state.delta.spatial
        })

        if (result.changed) {
          ctx.phase.spatial.changed = true
        }
      }
    },
    items: {
      after: ['graph'],
      run: (ctx) => {
        ctx.state.execution.items = new Set<SceneItemKey>()

        if (
          !(
            ctx.revision === 1
            || ctx.state.execution.reset
            || ctx.state.execution.order
            || executionScopeHasAny(ctx.state.execution.graph.node.entity)
            || executionScopeHasAny(ctx.state.execution.graph.edge.entity)
            || executionScopeHasAny(ctx.state.execution.graph.mindmap.entity)
            || executionScopeHasAny(ctx.state.execution.graph.group.entity)
          )
        ) {
          resetItemsPhaseDelta(ctx.state)
          return
        }

        const result = patchItemsState({
          revision: ctx.revision,
          snapshot: toDocumentSnapshot(ctx.input.document),
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset
        })

        if (!result.changed) {
          return
        }

        ctx.state.execution.items = (
          ctx.revision === 1 || ctx.state.execution.reset
            ? 'all'
            : collectItemChangeScope(ctx.state)
        )
        ctx.phase.items.changed = true
      }
    },
    ui: {
      after: ['graph'],
      run: (ctx) => {
        const count = patchUiState({
          current: ctx.input,
          execution: ctx.state.execution,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset
        })

        if (count > 0) {
          ctx.phase.ui.changed = true
          return
        }

        resetUiPhaseDelta(ctx.state)
      }
    },
    render: {
      after: ['graph', 'items', 'ui'],
      run: (ctx) => {
        const count = patchRenderState({
          current: ctx.input,
          execution: ctx.state.execution,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.execution.reset
        })

        if (count > 0) {
          ctx.phase.render.changed = true
          return
        }

        resetRenderPhaseDelta(ctx.state)
      }
    }
  } satisfies ProjectionPhaseTable<
    Input,
    WorkingState,
    EditorScenePhaseName
  >
})
