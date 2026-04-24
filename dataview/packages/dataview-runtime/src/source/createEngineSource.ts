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
  const current = input.engine.current()
  const documentSource = createDocumentSourceRuntime()
  const activeSource = createActiveSourceRuntime()

  const source = {
    document: documentSource.source,
    active: activeSource.source
  }

  const reset = (nextCurrent: typeof current) => {
    store.batch(() => {
      resetDocumentSource({
        runtime: documentSource,
        snapshot: {
          doc: nextCurrent.doc
        }
      })
      resetActiveSource({
        runtime: activeSource,
        snapshot: nextCurrent.publish?.active
      })
    })
  }

  const clear = () => {
    store.batch(() => {
      documentSource.clear()
      activeSource.clear()
    })
  }

  reset(current)

  const unsubscribe = input.engine.subscribe(nextCurrent => {
    store.batch(() => {
      applyDocumentDelta({
        runtime: documentSource,
        delta: nextCurrent.publish?.delta?.doc,
        snapshot: {
          doc: nextCurrent.doc
        }
      })
      applyActiveDelta({
        runtime: activeSource,
        delta: nextCurrent.publish?.delta?.active,
        snapshot: nextCurrent.publish?.active
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
