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

export const createCurrentViewStore = (input: {
  engine: Engine
}): ReadStore<CurrentView | undefined> => {
  function resolveProjection() {
    const viewId = input.engine.read.activeViewId.get()
    if (!viewId) {
      return undefined
    }

    return input.engine.read.viewProjection.get(viewId)
  }

  let cachedProjection = resolveProjection()
  let cachedCurrentView = cachedProjection

  return createDerivedStore<CurrentView | undefined>({
    get: read => {
      const viewId = read(input.engine.read.activeViewId)
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
