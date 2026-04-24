import { createProjector } from '@shared/projector'
import type {
  Change,
  Input,
  Runtime,
  Snapshot
} from '../contracts/editor'
import { createEditorGraphProjectorSpec } from './createSpec'
import { createEditorGraphQuery } from './query'

export const createEditorGraphRuntime = (): Runtime => {
  const projector = createProjector(createEditorGraphProjectorSpec())
  const snapshot = (): Snapshot => projector.snapshot()
  const query = createEditorGraphQuery({
    snapshot,
    spatial: () => projector.working().spatial,
    graph: () => projector.working().graph,
    indexes: () => projector.working().indexes
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
