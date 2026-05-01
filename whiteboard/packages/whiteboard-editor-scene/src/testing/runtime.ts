import type {
  EditorScene,
  Input,
  EditorSceneLayout,
  SceneUpdateInput,
  Result,
  Runtime
} from '../contracts/editor'
import type { Capture } from '../contracts/capture'
import type { WorkingState } from '../contracts/working'
import { createWhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import { createProjection } from '../projection/createProjection'
import {
  createProjectionRuntime
} from '../projection/createProjectionRuntime'
const normalizeInput = (input: SceneUpdateInput): Input => ({
  document: input.document,
  editor: input.editor,
  delta: createWhiteboardMutationDelta(input.document.delta)
})

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
  scene: EditorScene
  update(input: Input | SceneUpdateInput): Result
  capture(): Capture
  lastTrace(): Result['trace']
}

export interface EditorSceneProjectionHarness {
  capture(): Capture
  working(): WorkingState
  update(input: Input | SceneUpdateInput): Result
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
    scene: runtime.scene,
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
  let trace: Result['trace']

  return {
    capture: runtime.capture,
    working: () => runtime.state(),
    update: (value) => {
      const result = runtime.update(
        'delta' in value
          ? value
          : normalizeInput(value)
      )
      trace = result.trace
      return {
        revision: result.revision,
        trace: result.trace
      }
    },
    lastTrace: () => trace
  }
}
