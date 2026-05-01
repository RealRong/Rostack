import type {
  NodeCapabilityInput,
  Result,
  EditorSceneLayout
} from '../contracts/editor'
import type { EditorSceneRuntime } from '../contracts/runtime'
import type {
  EditorSceneSource,
  EditorSceneSourceEvent
} from '../contracts/source'
import { createProjectionRuntime } from './createProjectionRuntime'
import {
  createBootstrapRuntimeInputDelta,
  createEditorRuntimeInputDelta,
  createSceneInput,
  readBootstrapMutationDelta,
  readEventDocumentDelta
} from './input'

export const createRuntime = (input: {
  source: EditorSceneSource
  layout?: EditorSceneLayout
  nodeCapability?: NodeCapabilityInput
}): EditorSceneRuntime => {
  let currentSource = input.source.get()
  const runtime = createProjectionRuntime({
    layout: input.layout,
    nodeCapability: input.nodeCapability,
    view: () => currentSource.view
  })

  let lastResult: Result | null = null

  const publish = (event: EditorSceneSourceEvent) => {
    currentSource = event.source
    const runtimeDelta = createEditorRuntimeInputDelta({
      source: currentSource,
      event
    })
    lastResult = runtime.update(createSceneInput({
      source: currentSource,
      delta: readEventDocumentDelta(event),
      runtimeDelta
    }))
  }

  lastResult = runtime.update(createSceneInput({
    source: currentSource,
    delta: readBootstrapMutationDelta(),
    runtimeDelta: createBootstrapRuntimeInputDelta(currentSource)
  }))

  const unsubscribe = input.source.subscribe((event) => {
    publish(event)
  })

  void lastResult

  return {
    scene: runtime.scene,
    stores: runtime.stores,
    revision: runtime.revision,
    state: runtime.state,
    capture: runtime.capture,
    subscribe: runtime.subscribe,
    dispose: () => {
      unsubscribe()
      runtime.dispose()
    }
  }
}
