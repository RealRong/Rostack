import type {
  Input,
  Read,
  Result,
  Runtime,
  Snapshot
} from '../contracts/editor'
import { createEditorGraphRuntime } from '../runtime/createEditorGraphRuntime'

export interface EditorGraphHarness {
  runtime: Runtime
  read: Read
  update(input: Input): Result
  snapshot(): Snapshot
  lastTrace(): Result['trace']
}

export const createEditorGraphHarness = (): EditorGraphHarness => {
  const baseRuntime = createEditorGraphRuntime()
  let trace: Result['trace']
  const runtime: Runtime = {
    query: baseRuntime.query,
    snapshot: () => baseRuntime.snapshot(),
    update: (input) => {
      const result = baseRuntime.update(input)
      trace = result.trace
      return result
    },
    subscribe: (listener) => baseRuntime.subscribe(listener)
  }

  return {
    runtime,
    read: runtime.query,
    update: (input) => runtime.update(input),
    snapshot: () => runtime.snapshot(),
    lastTrace: () => trace
  }
}
