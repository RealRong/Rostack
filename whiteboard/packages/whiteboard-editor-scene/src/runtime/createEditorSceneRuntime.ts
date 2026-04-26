import { createProjectionRuntime } from '@shared/projector/model'
import type {
  Result,
  Runtime,
  TextMeasure
} from '../contracts/editor'
import type { State } from '../contracts/state'
import type { WorkingState } from '../contracts/working'
import { createEditorSceneProjectionModel } from './model'

const createEditorSceneStateReader = (input: {
  state: () => WorkingState
}): (() => State) => () => {
  const state = input.state()

  return {
    revision: state.revision,
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
} = {}) => {
  const runtime = createProjectionRuntime(
    createEditorSceneProjectionModel(input)
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
} = {}): Runtime => {
  const runtime = createEditorSceneModelRuntime(input)

  return {
    stores: runtime.stores,
    read: runtime.read,
    revision: runtime.revision,
    state: runtime.state,
    capture: runtime.capture,
    update: (current) => runtime.update(current) as Result,
    subscribe: (listener) => runtime.subscribe((result) => {
      listener(result as Result)
    })
  }
}
