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
  createEditorSceneRuntime
} from '../runtime/createEditorSceneRuntime'

const TEST_SCENE_VIEW = () => ({
  zoom: 1,
  center: {
    x: 0,
    y: 0
  },
  worldRect: {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }
})

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
    measure: input.measure,
    view: TEST_SCENE_VIEW
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
  const runtime = createEditorSceneRuntime({
    measure: input.measure,
    view: TEST_SCENE_VIEW
  })
  let trace: Result['trace']

  return {
    capture: () => runtime.capture(),
    working: () => runtime.state() as WorkingState,
    update: (value) => {
      const result = runtime.update(value)
      trace = result.trace
      return result
    },
    lastTrace: () => trace
  }
}
