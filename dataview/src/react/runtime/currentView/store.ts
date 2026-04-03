import type {
  ViewId
} from '@dataview/core/contracts'
import type {
  GroupEngine
} from '@dataview/engine'
import {
  createDerivedStore,
  type ReadStore
} from '@dataview/runtime/store'
import {
  createCommands
} from './commands'
import type {
  CurrentView
} from './types'
import {
  resolveActiveViewId
} from '@dataview/react/page/state'
import type {
  PageSessionState
} from '@dataview/react/page/session/types'
import type {
  SelectionStore
} from '@dataview/react/runtime/selection'

export const createCurrentViewStore = (input: {
  engine: GroupEngine
  pageStore: ReadStore<PageSessionState>
  selection: SelectionStore
}): ReadStore<CurrentView | undefined> => {
  const commands = createCommands({
    engine: input.engine,
    selection: input.selection,
    currentView: () => resolveProjection()
  })

  const resolveCurrentViewId = (): ViewId | undefined => (
    resolveActiveViewId(
      input.engine.read.document.get(),
      input.pageStore.get().activeViewId
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
    ? {
        ...cachedProjection,
        commands
      }
    : undefined

  return createDerivedStore<CurrentView | undefined>({
    get: read => {
      const document = read(input.engine.read.document)
      const page = read(input.pageStore)
      const viewId = resolveActiveViewId(document, page.activeViewId)
      const projection = viewId
        ? read(input.engine.read.viewProjection, viewId)
        : undefined

      if (projection === cachedProjection) {
        return cachedCurrentView
      }

      cachedProjection = projection
      cachedCurrentView = projection
        ? {
            ...projection,
            commands
          }
        : undefined
      return cachedCurrentView
    }
  })
}
