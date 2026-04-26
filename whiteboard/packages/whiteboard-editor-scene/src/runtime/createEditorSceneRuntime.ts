import { createProjectionRuntime } from '@shared/projection'
import type {
  NodeCapabilityInput,
  OwnerRef,
  Result,
  Runtime,
  SceneViewInput,
  TextMeasure
} from '../contracts/editor'
import type { NodeModel } from '@whiteboard/core/types'
import type { State } from '../contracts/state'
import type { WorkingState } from '../contracts/working'
import { createEditorSceneProjectionSpec } from './model'

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

export const createEditorSceneRuntime = (input: {
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}): Runtime => {
  const runtime = createProjectionRuntime(
    createEditorSceneProjectionSpec(input)
  )
  const state = createEditorSceneStateReader({
    state: runtime.state
  })

  return {
    stores: runtime.stores,
    query: runtime.read,
    revision: runtime.revision,
    state,
    capture: runtime.capture,
    update: (current) => runtime.update(current) as Result,
    subscribe: (listener) => runtime.subscribe((result) => {
      listener(result as Result)
    })
  }
}
