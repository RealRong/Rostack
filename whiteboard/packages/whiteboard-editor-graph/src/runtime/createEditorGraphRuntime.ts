import { createRuntime } from '@shared/projection-runtime'
import type {
  Change,
  Input,
  Runtime,
  Snapshot
} from '../contracts/editor'
import { createEditorGraphRuntimeSpec } from './createSpec'
import { createEditorGraphQuery } from './query'

export const createEditorGraphRuntime = (): Runtime => {
  const baseRuntime = createRuntime(createEditorGraphRuntimeSpec())
  const snapshot = (): Snapshot => baseRuntime.snapshot()
  const query = createEditorGraphQuery({
    snapshot
  })

  return {
    query,
    snapshot,
    update: (input: Input) => baseRuntime.update(input),
    subscribe: (listener) => {
      const unsubscribe = baseRuntime.subscribe((result) => {
        listener(result.snapshot, result.change)
      })
      return unsubscribe
    }
  }
}
