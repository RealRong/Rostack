import { createProjectionRuntime } from '@shared/projector/model'
import type {
  Result,
  Runtime,
  TextMeasure
} from '../contracts/editor'
import { createEditorSceneProjectionModel } from './model'
import { createEditorSceneSnapshotReader } from './published'

export const createEditorSceneModelRuntime = (input: {
  measure?: TextMeasure
} = {}) => {
  const runtime = createProjectionRuntime(
    createEditorSceneProjectionModel(input)
  )
  const snapshot = createEditorSceneSnapshotReader({
    state: runtime.state,
    revision: runtime.revision
  })

  return {
    ...runtime,
    snapshot
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
    snapshot: runtime.snapshot,
    update: (current) => runtime.update(current) as Result,
    subscribe: (listener) => runtime.subscribe((result) => {
      listener(result as Result)
    })
  }
}
