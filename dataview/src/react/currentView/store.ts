import type {
  ViewId
} from '@dataview/core/contracts'
import type {
  GroupEngine
} from '@dataview/engine'
import {
  createValueStore,
  type ReadStore
} from '@dataview/runtime/store'
import {
  createCommands
} from './commands'
import {
  emptySelection,
  selection as selectionHelpers,
  syncSelection
} from '@dataview/react/selection'
import type {
  CurrentView
} from './types'
import {
  resolveActiveViewId
} from '@dataview/react/page/session/state'
import type {
  PageSessionState
} from '@dataview/react/page/session/types'
import type {
  SelectionStore
} from '@dataview/react/selection'

export const createCurrentViewStore = (input: {
  engine: GroupEngine
  pageStore: ReadStore<PageSessionState>
  selection: SelectionStore
}): {
  currentView: ReadStore<CurrentView | undefined>
  dispose: () => void
} => {
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

  const resolve = (): CurrentView | undefined => {
    const projection = resolveProjection()
    if (!projection) {
      if (!selectionHelpers.equal(input.selection.get(), emptySelection)) {
        input.selection.set(emptySelection)
      }
      return undefined
    }

    syncSelection(input.selection, projection.appearances.ids)

    return {
      ...projection,
      commands
    }
  }

  const store = createValueStore<CurrentView | undefined>({
    initial: resolve()
  })
  const sync = () => {
    store.set(resolve())
  }
  const unsubscribeDocument = input.engine.read.document.subscribe(sync)
  let lastPageViewId = input.pageStore.get().activeViewId
  const unsubscribePage = input.pageStore.subscribe(() => {
    const nextPageViewId = input.pageStore.get().activeViewId
    if (nextPageViewId === lastPageViewId) {
      return
    }

    lastPageViewId = nextPageViewId
    sync()
  })

  return {
    currentView: {
      get: store.get,
      subscribe: store.subscribe
    },
    dispose: () => {
      unsubscribeDocument()
      unsubscribePage()
    }
  }
}
