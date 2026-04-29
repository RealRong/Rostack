import type {
  NodeCapabilityInput,
  Result,
  TextMeasure
} from '../contracts/editor'
import type { EditorSceneRuntime } from '../contracts/runtime'
import type { EditorSceneSource } from '../contracts/source'
import { createEditorSceneProjectionRuntime } from './createEditorSceneProjectionRuntime'
import {
  createBootstrapRuntimeInputDelta,
  createSceneInput,
  createSourceRuntimeInputDelta,
  readBootstrapMutationDelta,
  readSourceMutationDelta
} from './sourceInput'

export const createEditorSceneRuntime = (input: {
  source: EditorSceneSource
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
}): EditorSceneRuntime => {
  let currentSource = input.source.get()
  const runtime = createEditorSceneProjectionRuntime({
    measure: input.measure,
    nodeCapability: input.nodeCapability,
    view: () => currentSource.view
  })

  let lastResult: Result | null = null

  const publish = (change: Parameters<EditorSceneSource['subscribe']>[0] extends (value: infer TValue) => void
    ? TValue
    : never, previousSource = currentSource) => {
    currentSource = input.source.get()
    const runtimeDelta = createSourceRuntimeInputDelta({
      previous: previousSource,
      next: currentSource,
      change
    })
    lastResult = runtime.update(createSceneInput({
      source: currentSource,
      delta: readSourceMutationDelta(change),
      runtimeDelta
    }))
  }

  lastResult = runtime.update(createSceneInput({
    source: currentSource,
    delta: readBootstrapMutationDelta(),
    runtimeDelta: createBootstrapRuntimeInputDelta(currentSource)
  }))

  const unsubscribe = input.source.subscribe((change) => {
    publish(change)
  })

  void lastResult

  return {
    stores: runtime.stores,
    query: runtime.query,
    revision: runtime.revision,
    state: runtime.state,
    capture: runtime.capture,
    subscribe: runtime.subscribe,
    dispose: () => {
      unsubscribe()
    }
  }
}
