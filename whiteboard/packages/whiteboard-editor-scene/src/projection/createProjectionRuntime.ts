import { createWhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type {
  Input,
  NodeCapabilityInput,
  SceneViewInput,
  EditorSceneLayout,
  SceneUpdateInput
} from '../contracts/editor'
import type { EditorSceneRuntime } from '../contracts/runtime'
import type { State } from '../contracts/state'
import type { WorkingState } from '../contracts/working'
import { createProjection } from './createProjection'
import { createScene } from './scene'

const createEditorSceneStateReader = (input: {
  state: () => WorkingState
}): (() => State) => () => {
  const state = input.state()

  return {
    revision: state.revision,
    document: state.document,
    runtime: state.runtime,
    graph: state.graph,
    indexes: state.indexes,
    spatial: state.spatial,
    ui: state.ui,
    render: state.render,
    items: state.items
  }
}

const normalizeSceneUpdateInput = (
  input: SceneUpdateInput
): Input => ({
  document: input.document,
  editor: input.editor,
  delta: createWhiteboardMutationDelta(input.document.delta)
})

export const createProjectionRuntime = (input: {
  layout?: EditorSceneLayout
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}): EditorSceneRuntime => {
  const runtime = createProjection(input)
  const scene = createScene({
    read: runtime.read,
    stores: runtime.stores
  })
  const state = createEditorSceneStateReader({
    state: runtime.state
  })

  return {
    scene,
    stores: runtime.stores,
    revision: runtime.revision,
    state,
    capture: runtime.capture,
    dispose: () => {
      scene.dispose()
    },
    update: (value) => {
      const result = runtime.update(normalizeSceneUpdateInput(value))
      return {
        revision: result.revision,
        trace: result.trace
      }
    },
    subscribe: (listener) => runtime.subscribe((result) => {
      listener({
        revision: result.revision,
        trace: result.trace
      })
    })
  }
}
