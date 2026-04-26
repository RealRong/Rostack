import type {
  Input,
  Read,
  Result,
  Runtime,
  Snapshot,
  TextMeasure
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import {
  createEditorSceneModelRuntime,
  createEditorSceneRuntime
} from '../runtime/createEditorSceneRuntime'

export interface EditorSceneHarness {
  runtime: Runtime
  read: Read
  update(input: Input): Result
  snapshot(): Snapshot
  lastTrace(): Result['trace']
}

export interface EditorSceneModelHarness {
  snapshot(): Snapshot
  working(): WorkingState
  update(input: Input): Result
  lastTrace(): Result['trace']
}

export const createEditorSceneHarness = (input: {
  measure?: TextMeasure
} = {}): EditorSceneHarness => {
  const runtime = createEditorSceneRuntime({
    measure: input.measure
  })
  let trace: Result['trace']

  return {
    runtime,
    read: runtime.read,
    update: (value) => {
      const result = runtime.update(value)
      trace = result.trace
      return result
    },
    snapshot: () => runtime.snapshot(),
    lastTrace: () => trace
  }
}

export const createEditorSceneModelHarness = (input: {
  measure?: TextMeasure
} = {}): EditorSceneModelHarness => {
  const runtime = createEditorSceneModelRuntime({
    measure: input.measure
  })
  let trace: Result['trace']

  return {
    snapshot: () => runtime.snapshot(),
    working: () => runtime.state(),
    update: (value) => {
      const result = runtime.update(value) as Result
      trace = result.trace
      return result
    },
    lastTrace: () => trace
  }
}
