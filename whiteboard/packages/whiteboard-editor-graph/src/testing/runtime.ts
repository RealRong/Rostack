import type {
  Input,
  InputChange,
  Read,
  Result,
  Runtime,
  Snapshot
} from '../contracts/editor'
import { createEditorGraphRead } from '../read/createRead'
import { createEditorGraphRuntime } from '../runtime/createEditorGraphRuntime'

export interface EditorGraphHarness {
  runtime: Runtime
  read: Read
  update(input: Input, change: InputChange): Result
  snapshot(): Snapshot
  lastTrace(): Result['trace']
}

export const createEditorGraphHarness = (): EditorGraphHarness => {
  const baseRuntime = createEditorGraphRuntime()
  let trace: Result['trace']
  const runtime: Runtime = {
    snapshot: () => baseRuntime.snapshot(),
    update: (input, change) => {
      const result = baseRuntime.update(input, change)
      trace = result.trace
      return result
    },
    subscribe: (listener) => baseRuntime.subscribe(listener)
  }

  return {
    runtime,
    read: createEditorGraphRead({
      runtime
    }),
    update: (input, change) => runtime.update(input, change),
    snapshot: () => runtime.snapshot(),
    lastTrace: () => trace
  }
}
