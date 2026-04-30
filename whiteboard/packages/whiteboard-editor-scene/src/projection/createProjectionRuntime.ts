import type {
  NodeCapabilityInput,
  Runtime,
  SceneViewInput,
  EditorSceneLayout
} from '../contracts/editor'
import type { State } from '../contracts/state'
import type { WorkingState } from '../contracts/working'
import { createProjection } from './createProjection'

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

export const createProjectionRuntime = (input: {
  layout?: EditorSceneLayout
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}): Runtime => {
  const runtime = createProjection(input)
  const state = createEditorSceneStateReader({
    state: runtime.state
  })
  return {
    stores: runtime.stores,
    query: runtime.read,
    revision: runtime.revision,
    state,
    capture: runtime.capture,
    update: (value) => {
      const result = runtime.update(value)
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
