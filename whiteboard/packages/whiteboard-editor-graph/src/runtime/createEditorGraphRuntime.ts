import { createRuntime } from '@shared/projection-runtime'
import type {
  Change,
  Input,
  Runtime,
  Snapshot
} from '../contracts/editor'
import { createEditorGraphRuntimeSpec } from './createSpec'

export const createEditorGraphRuntime = (): Runtime => {
  const runtime = createRuntime(createEditorGraphRuntimeSpec())

  return {
    snapshot: () => runtime.snapshot(),
    update: (input: Input) => runtime.update(input),
    subscribe: (listener) => {
      const unsubscribe = runtime.subscribe((result) => {
        listener(result.snapshot, result.change)
      })
      return unsubscribe
    }
  }
}
