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
} from '../contracts/facts'
import { patchGraphState } from '../model/graph/patch'
import { patchDocumentState } from '../model/document/patch'
import { createEmptyEditorSceneFacts } from '../contracts/facts'
import { patchItemsState } from '../model/items/patch'
import { patchRenderState } from '../model/render/patch'
import { createInputFacts } from '../model/facts'
import { patchSpatial } from '../model/spatial/update'
import { resetSpatialDelta } from '../model/spatial/update'
import { patchUiState } from '../model/ui/patch'
import {
  createProjectionRead,
  type ProjectionScene
} from './query'
import { buildEditorSceneCapture } from './capture'
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
  context: ProjectionContext<Input, WorkingState, ProjectionScene, EditorScenePhaseName>
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
  ProjectionScene,
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
      ctx.state.facts = createEmptyEditorSceneFacts()
      ctx.state.facts.input = createInputFacts(ctx.input)

      patchDocumentState({
        current: ctx.input,
        working: ctx.state,
        reset: ctx.dirty.reset
      })

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
        const reset = ctx.revision === 1 || ctx.state.facts.input.reset

        const result = patchGraphState({
          revision: ctx.revision,
          current: ctx.input,
          facts: ctx.state.facts.input,
          working: ctx.state,
          reset,
          previousDocument: dirty.previousDocument
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
        const reset = ctx.revision === 1 || ctx.state.facts.input.reset
        const graphFacts = ctx.state.facts.graph
        if (
          !(
            ctx.revision === 1
            || reset
            || ctx.state.facts.input.order
            || sceneScopeHasAny(graphFacts.node.entity)
            || sceneScopeHasAny(graphFacts.node.geometry)
            || sceneScopeHasAny(graphFacts.edge.entity)
            || sceneScopeHasAny(graphFacts.edge.geometry)
            || sceneScopeHasAny(graphFacts.mindmap.entity)
            || sceneScopeHasAny(graphFacts.mindmap.geometry)
            || sceneScopeHasAny(graphFacts.group.entity)
            || sceneScopeHasAny(graphFacts.group.geometry)
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
          reset,
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
        const reset = ctx.revision === 1 || ctx.state.facts.input.reset
        if (
          !(
            ctx.revision === 1
            || reset
            || ctx.state.facts.input.order
            || ctx.state.facts.graph.hasLifecycleChange
          )
        ) {
          resetItemsPhaseDelta(ctx.state)
          ctx.state.facts.items.touched = new Set()
          return
        }

        const result = patchItemsState({
          revision: ctx.revision,
          snapshot: toDocumentSnapshot(ctx.input.document),
          working: ctx.state,
          reset
        })

        if (!result.changed) {
          return
        }
        ctx.phase.items.changed = true
      }
    },
    ui: {
      after: ['graph'],
      run: (ctx) => {
        const reset = ctx.revision === 1 || ctx.state.facts.input.reset
        const count = patchUiState({
          current: ctx.input,
          working: ctx.state,
          reset
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
        const reset = ctx.revision === 1 || ctx.state.facts.input.reset
        const count = patchRenderState({
          current: ctx.input,
          working: ctx.state,
          reset
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
    ProjectionScene,
    EditorScenePhaseName
  >
})
