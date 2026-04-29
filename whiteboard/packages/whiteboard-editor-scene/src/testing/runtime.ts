import type {
  Input,
  EditorSceneLayout,
  Query,
  Result,
  Runtime
} from '../contracts/editor'
import type { Capture } from '../contracts/capture'
import type { WorkingState } from '../contracts/working'
import { createEditorSceneCaptureReader } from '../projection/capture'
import { createProjection } from '../projection/createProjection'
import {
  createProjectionRuntime
} from '../projection/createProjectionRuntime'

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
  layout?: EditorSceneLayout
} = {}): EditorSceneHarness => {
  const runtime = createProjectionRuntime({
    layout: input.layout,
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
  layout?: EditorSceneLayout
} = {}): EditorSceneProjectionHarness => {
  const runtime = createProjection({
    layout: input.layout,
    view: TEST_SCENE_VIEW
  })
  const capture = createEditorSceneCaptureReader({
    state: runtime.state,
    revision: runtime.revision
  })
  let trace: Result['trace']

  return {
    capture,
    working: () => runtime.state(),
    update: (value) => {
      const result = runtime.update(value)
      trace = result.trace
      return {
        revision: result.revision,
        trace: result.trace
      }
    },
    lastTrace: () => trace
  }
}
