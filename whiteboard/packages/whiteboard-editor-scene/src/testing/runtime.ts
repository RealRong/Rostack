import { createProjectionRuntime } from '@shared/projection'
import type {
  Input,
  Query,
  Result,
  Runtime,
  TextMeasure
} from '../contracts/editor'
import type { Capture } from '../contracts/capture'
import type { WorkingState } from '../contracts/working'
import { createEditorSceneProjectionSpec } from '../runtime/model'
import {
  createEditorSceneProjectionRuntime
} from '../runtime/createEditorSceneProjectionRuntime'

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

export interface EditorSceneProjectionHarness {
  capture(): Capture
  working(): WorkingState
  update(input: Input): Result
  lastTrace(): Result['trace']
}

export const createEditorSceneHarness = (input: {
  measure?: TextMeasure
} = {}): EditorSceneHarness => {
  const runtime = createEditorSceneProjectionRuntime({
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

export const createEditorSceneProjectionHarness = (input: {
  measure?: TextMeasure
} = {}): EditorSceneProjectionHarness => {
  const runtime = createProjectionRuntime(createEditorSceneProjectionSpec({
    measure: input.measure,
    view: TEST_SCENE_VIEW
  }))
  let trace: Result['trace']

  return {
    capture: () => runtime.capture(),
    working: () => runtime.state(),
    update: (value) => {
      const result = runtime.update(value)
      trace = result.trace
      return result
    },
    lastTrace: () => trace
  }
}
