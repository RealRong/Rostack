import type {
  ViewId
} from '@dataview/core/contracts'
import type {
  Engine
} from '@dataview/engine'
import {
  createDerivedStore,
  type ReadStore
} from '@shared/store'
import type {
  CurrentView
} from './types'
import {
  resolveActiveViewId
} from '@dataview/react/page/state'
import type {
  PageSessionState
} from '@dataview/react/page/session/types'

export const createCurrentViewStore = (input: {
  engine: Engine
  pageStore: ReadStore<PageSessionState>
}): ReadStore<CurrentView | undefined> => {
  const resolveCurrentViewId = (): ViewId | undefined => (
    resolveActiveViewId(
      input.engine.read.document.get(),
      input.pageStore.get().viewId
    )
  )

  function resolveProjection() {
    const viewId = resolveCurrentViewId()
    if (!viewId) {
      return undefined
    }

    return input.engine.read.viewProjection.get(viewId)
  }

  let cachedProjection = resolveProjection()
  let cachedCurrentView = cachedProjection

  return createDerivedStore<CurrentView | undefined>({
    get: read => {
      const document = read(input.engine.read.document)
      const page = read(input.pageStore)
      const viewId = resolveActiveViewId(document, page.viewId)
      const projection = viewId
        ? read(input.engine.read.viewProjection, viewId)
        : undefined

      if (projection === cachedProjection) {
        return cachedCurrentView
      }

      cachedProjection = projection
      cachedCurrentView = projection
      return cachedCurrentView
    }
  })
}
