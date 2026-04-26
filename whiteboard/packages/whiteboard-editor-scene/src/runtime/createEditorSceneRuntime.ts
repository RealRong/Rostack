import { createProjectionRuntime } from '@shared/projector/model'
import type {
  NodeCapabilityInput,
  OwnerRef,
  Result,
  Runtime,
  SceneViewInput,
  TextMeasure
} from '../contracts/editor'
import type { NodeModel, Size } from '@whiteboard/core/types'
import type { State } from '../contracts/state'
import type { WorkingState } from '../contracts/working'
import { createEditorSceneProjectionModel } from './model'

const DEFAULT_NODE_SIZE = {
  width: 0,
  height: 0
} as const

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

export const createEditorSceneModelRuntime = (input: {
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
  document?: {
    nodeSize: Size
  }
  view: SceneViewInput
}) => {
  const runtime = createProjectionRuntime(
    createEditorSceneProjectionModel({
      ...input,
      document: input.document ?? {
        nodeSize: DEFAULT_NODE_SIZE
      }
    })
  )
  const state = createEditorSceneStateReader({
    state: runtime.state
  })

  return {
    ...runtime,
    working: runtime.state,
    state
  }
}

export const createEditorSceneRuntime = (input: {
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
  document?: {
    nodeSize: Size
  }
  view: SceneViewInput
}): Runtime => {
  const runtime = createEditorSceneModelRuntime(input)

  return {
    stores: runtime.stores,
    query: runtime.read,
    revision: runtime.revision,
    state: runtime.state,
    capture: runtime.capture,
    update: (current) => runtime.update(current) as Result,
    subscribe: (listener) => runtime.subscribe((result) => {
      listener(result as Result)
    })
  }
}
