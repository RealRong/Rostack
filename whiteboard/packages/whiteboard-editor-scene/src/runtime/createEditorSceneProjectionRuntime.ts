import type {
  NodeCapabilityInput,
  Runtime,
  SceneViewInput,
  TextMeasure
} from '../contracts/editor'
import type { State } from '../contracts/state'
import type { WorkingState } from '../contracts/working'
import { createEditorSceneCaptureReader } from './capture'
import { createEditorSceneProjection } from './model'

const createEditorSceneStateReader = (input: {
  state: () => WorkingState
}): (() => State) => () => {
  const state = input.state()

  return {
    revision: state.revision,
    document: state.document,
    graph: state.graph,
    indexes: state.indexes,
    spatial: state.spatial,
    ui: state.ui,
    render: state.render,
    items: state.items
  }
}

export const createEditorSceneProjectionRuntime = (input: {
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}): Runtime => {
  const runtime = createEditorSceneProjection(input)
  const state = createEditorSceneStateReader({
    state: runtime.state
  })
  const capture = createEditorSceneCaptureReader({
    state: runtime.state,
    revision: runtime.revision
  })

  return {
    stores: runtime.stores,
    query: runtime.read,
    revision: runtime.revision,
    state,
    capture,
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
