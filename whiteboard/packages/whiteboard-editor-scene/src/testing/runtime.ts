import type {
  Input,
  Query,
  Result,
  Runtime,
  TextMeasure
} from '../contracts/editor'
import type { Capture } from '../contracts/capture'
import type { WorkingState } from '../contracts/working'
import {
  createEditorSceneModelRuntime,
  createEditorSceneRuntime
} from '../runtime/createEditorSceneRuntime'

export interface EditorSceneHarness {
  runtime: Runtime
  query: Query
  update(input: Input): Result
  capture(): Capture
  lastTrace(): Result['trace']
}

export interface EditorSceneModelHarness {
  capture(): Capture
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
    query: runtime.query,
    update: (value) => {
      const result = runtime.update(value)
      trace = result.trace
      return result
    },
    capture: () => runtime.capture(),
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
    capture: () => runtime.capture(),
    working: () => runtime.working(),
    update: (value) => {
      const result = runtime.update(value) as Result
      trace = result.trace
      return result
    },
    lastTrace: () => trace
  }
}
