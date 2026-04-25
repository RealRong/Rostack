import { createProjector } from '@shared/projector'
import type {
  Input,
  Read,
  Result,
  Runtime,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import {
  createWorking,
  editorGraphProjectorSpec
} from '../projector/spec'
import { createEditorGraphRuntime } from '../runtime/createEditorGraphRuntime'

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

export const createEditorGraphProjectorHarness = (): EditorGraphProjectorHarness => {
  const working = createWorking()
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
