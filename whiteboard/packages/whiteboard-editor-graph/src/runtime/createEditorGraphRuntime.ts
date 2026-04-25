import { createProjector } from '@shared/projector'
import type {
  Change,
  Input,
  Runtime,
  Snapshot
} from '../contracts/editor'
import {
  createWorking,
  editorGraphProjectorSpec
} from '../projector/spec'
import { createEditorGraphQuery } from './query'

export const createEditorGraphRuntime = (): Runtime => {
  const working = createWorking()
  const projector = createProjector({
    ...editorGraphProjectorSpec,
    createWorking: () => working
  })
  const snapshot = (): Snapshot => projector.snapshot()
  const query = createEditorGraphQuery({
    snapshot,
    spatial: () => working.spatial,
    graph: () => working.graph,
    indexes: () => working.indexes
  })

  return {
    query,
    snapshot,
    update: (input: Input) => projector.update(input),
    subscribe: (listener) => {
      const wrapped = (result: {
        snapshot: Snapshot
        change: Change
      }) => {
        listener(result.snapshot, result.change)
      }
      return projector.subscribe(wrapped)
    }
  }
}
