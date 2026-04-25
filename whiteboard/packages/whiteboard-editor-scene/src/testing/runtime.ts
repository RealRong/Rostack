import { createProjector } from '@shared/projector'
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
  createWorking,
  editorGraphProjectorSpec
} from '../projector/spec'
import { createEditorSceneRuntime } from '../runtime/createEditorSceneRuntime'

export interface EditorGraphHarness {
  runtime: Runtime
  read: Read
  update(input: Input): Result
  snapshot(): Snapshot
  lastTrace(): Result['trace']
}

export interface EditorGraphProjectorHarness {
  snapshot(): Snapshot
  working(): WorkingState
  update(input: Input): Result
  lastTrace(): Result['trace']
}

export const createEditorGraphHarness = (input: {
  measure?: TextMeasure
} = {}): EditorGraphHarness => {
  const baseRuntime = createEditorSceneRuntime({
    measure: input.measure
  })
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

export const createEditorGraphProjectorHarness = (input: {
  measure?: TextMeasure
} = {}): EditorGraphProjectorHarness => {
  const working = createWorking({
    measure: input.measure
  })
  const projector = createProjector({
    ...editorGraphProjectorSpec,
    createWorking: () => working
  })
  let trace: Result['trace']

  return {
    snapshot: () => projector.snapshot(),
    working: () => working,
    update: (input) => {
      const result = projector.update(input)
      trace = result.trace
      return result
    },
    lastTrace: () => trace
  }
}
