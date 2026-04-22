import { store } from '@shared/core'
import type {
  CreateEngineSourceInput,
  EngineSourceRuntime
} from '@dataview/runtime/source/contracts'
import {
  applyActiveDelta,
  createActiveSourceRuntime,
  resetActiveSource
} from '@dataview/runtime/source/createActiveSource'
import {
  applyDocumentDelta,
  createDocumentSourceRuntime,
  resetDocumentSource
} from '@dataview/runtime/source/createDocumentSource'

export const createEngineSource = (
  input: CreateEngineSourceInput
): EngineSourceRuntime => {
  const snapshot = input.core.read.result().snapshot
  const documentSource = createDocumentSourceRuntime()
  const activeSource = createActiveSourceRuntime()

  const source = {
    doc: documentSource.source,
    active: activeSource.source
  }

  const reset = (nextSnapshot: typeof snapshot) => {
    store.batch(() => {
      resetDocumentSource({
        runtime: documentSource,
        snapshot: nextSnapshot
      })
      resetActiveSource({
        runtime: activeSource,
        snapshot: nextSnapshot.active
      })
    })
  }

  const clear = () => {
    store.batch(() => {
      documentSource.clear()
      activeSource.clear()
    })
  }

  reset(snapshot)

  const unsubscribe = input.core.subscribe(result => {
    store.batch(() => {
      applyDocumentDelta({
        runtime: documentSource,
        delta: result.delta?.doc,
        snapshot: result.snapshot
      })
      applyActiveDelta({
        runtime: activeSource,
        delta: result.delta?.active,
        snapshot: result.snapshot.active
      })
    })
  })

  return {
    source,
    dispose: () => {
      unsubscribe()
      clear()
    }
  }
}
