import {
  createProjection as createSharedProjection,
  type ProjectionContext
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
import type { Capture } from '../contracts/capture'
import {
  compileValueChange,
  resetRenderPhaseDelta as resetRenderPhaseState,
  resetRenderDelta,
  resetDocumentDelta,
  resetGraphDelta,
  resetGraphPhaseDelta as resetGraphPhaseState,
  resetUiPhaseDelta as resetUiPhaseState
} from '../contracts/delta'
import type {
  WorkingState
} from '../contracts/working'
import {
  sceneScopeHasAny
} from '../contracts/plan'
import { patchGraphState } from '../model/graph/patch'
import { patchDocumentState } from '../model/document/patch'
import { patchItemsState } from '../model/items/patch'
import { patchRenderState } from '../model/render/patch'
import { patchSpatial } from '../model/spatial/update'
import { resetSpatialDelta } from '../model/spatial/update'
import { patchUiState } from '../model/ui/patch'
import {
  createProjectionRead,
  type EditorSceneProjectionRead
} from './query'
import { buildEditorSceneCapture } from './capture'
import {
  createEditorScenePlan,
  refreshEditorScenePlanAfterGraph,
  refreshEditorScenePlanAfterItems,
  refreshEditorScenePlanAfterUi,
  refreshEditorScenePlanForRender
} from './plan'
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
  context: ProjectionContext<Input, WorkingState, EditorSceneProjectionRead, EditorScenePhaseName>
): EditorSceneProjectionDirty => context.dirty as EditorSceneProjectionDirty

const resetGraphPhaseDelta = (
  state: WorkingState
) => {
  resetGraphDelta(state.delta.graph)
  resetGraphPhaseState(state.phase.graph)
}

const resetDocumentPhaseDelta = (
  state: WorkingState
) => {
  resetDocumentDelta(state.delta.document)
}

const resetItemsPhaseDelta = (
  state: WorkingState
) => {
  state.delta.items = 'skip'
}

const resetUiPhaseDelta = (
  state: WorkingState
) => {
  resetUiPhaseState(state.phase.ui)
  state.delta.graph.state.node = 'skip'
  state.delta.graph.state.edge = 'skip'
  state.delta.graph.state.chrome = 'skip'
}

const resetRenderPhaseDelta = (
  state: WorkingState
) => {
  resetRenderPhaseState(state.phase.render)
  resetRenderDelta(state.delta.render)
}

const toDocumentSnapshot = (
  input: Input['document']
) => ({
  revision: input.rev,
  document: input.doc
})

export const createProjection = (input: {
  layout?: EditorSceneLayout
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}) => createSharedProjection<
  Input,
  WorkingState,
  EditorSceneProjectionRead,
  Capture,
  EditorScenePhaseName,
  typeof editorSceneStores
>({
  createState: () => createWorking({
    layout: input.layout
  }),
  createRead: (runtime) => createProjectionRead({
    revision: runtime.revision,
    state: runtime.state,
    items: () => runtime.state().items,
    spatial: () => runtime.state().spatial,
    nodeCapability: input.nodeCapability,
    view: input.view
  }),
  capture: ({ read, revision }) => buildEditorSceneCapture(
    read,
    revision
  ),
  stores: editorSceneStores,
  phases: {
    document: (ctx) => {
      const dirty = readProjectionDirty(ctx)
      const previousDocumentRevision = ctx.read.capture.documentRevision()
      const previousBackground = ctx.read.document.background()

      dirty.previousDocument = ctx.read.document.snapshot()
      resetDocumentPhaseDelta(ctx.state)
      ctx.state.runtime = ctx.input.runtime

      patchDocumentState({
        current: ctx.input,
        working: ctx.state,
        reset: ctx.dirty.reset
      })
      ctx.state.plan = createEditorScenePlan(ctx.input)

      if (
        ctx.revision === 1
        || previousDocumentRevision !== ctx.input.document.rev
      ) {
        ctx.state.delta.document.revision = compileValueChange(
          true,
          ctx.state.revision.document
        )
        ctx.phase.document.changed = true
      }

      if (
        ctx.revision === 1
        || previousBackground !== ctx.state.document.background
      ) {
        ctx.state.delta.document.background = compileValueChange(
          true,
          ctx.state.document.background
        )
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
          plan: ctx.state.plan,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.plan.reset,
          previousDocument: dirty.previousDocument
        })
        refreshEditorScenePlanAfterGraph({
          current: ctx.input,
          working: ctx.state,
          plan: ctx.state.plan,
          reset: ctx.revision === 1 || ctx.state.plan.reset
        })
        if (!result.ran) {
          resetGraphPhaseDelta(ctx.state)
          return
        }

        const graphChanged = (
          result.count > 0
          || ctx.revision === 1
          || ctx.state.phase.graph.order
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
            || ctx.state.plan.reset
            || ctx.state.plan.spatial.order
            || sceneScopeHasAny(ctx.state.plan.spatial.node)
            || sceneScopeHasAny(ctx.state.plan.spatial.edge)
            || sceneScopeHasAny(ctx.state.plan.spatial.mindmap)
            || sceneScopeHasAny(ctx.state.plan.spatial.group)
          )
        ) {
          resetSpatialDelta(ctx.state.phase.spatial)
          return
        }

        const result = patchSpatial({
          revision: ctx.revision,
          graph: ctx.state.graph,
          snapshot: toDocumentSnapshot(ctx.input.document),
          graphDelta: ctx.state.phase.graph,
          state: ctx.state.spatial,
          reset: ctx.revision === 1 || ctx.state.plan.reset,
          delta: ctx.state.phase.spatial
        })

        if (result.changed) {
          ctx.phase.spatial.changed = true
        }
      }
    },
    items: {
      after: ['graph'],
      run: (ctx) => {
        if (
          !(
            ctx.revision === 1
            || ctx.state.plan.reset
            || ctx.state.plan.order
            || sceneScopeHasAny(ctx.state.plan.items)
          )
        ) {
          resetItemsPhaseDelta(ctx.state)
          ctx.state.plan.items = new Set()
          return
        }

        const result = patchItemsState({
          revision: ctx.revision,
          snapshot: toDocumentSnapshot(ctx.input.document),
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.plan.reset
        })

        if (!result.changed) {
          ctx.state.plan.items = new Set()
          return
        }

        refreshEditorScenePlanAfterItems({
          working: ctx.state,
          plan: ctx.state.plan,
          reset: ctx.revision === 1 || ctx.state.plan.reset
        })
        ctx.phase.items.changed = true
      }
    },
    ui: {
      after: ['graph'],
      run: (ctx) => {
        const count = patchUiState({
          current: ctx.input,
          plan: ctx.state.plan,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.plan.reset
        })
        refreshEditorScenePlanAfterUi({
          working: ctx.state,
          plan: ctx.state.plan,
          reset: ctx.revision === 1 || ctx.state.plan.reset
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
        refreshEditorScenePlanForRender({
          current: ctx.input,
          working: ctx.state,
          plan: ctx.state.plan,
          reset: ctx.revision === 1 || ctx.state.plan.reset
        })
        const count = patchRenderState({
          current: ctx.input,
          plan: ctx.state.plan,
          working: ctx.state,
          reset: ctx.revision === 1 || ctx.state.plan.reset
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
    EditorSceneProjectionRead,
    EditorScenePhaseName
  >
})
