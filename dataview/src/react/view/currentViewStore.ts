import type {
  ViewId
} from '@/core/contracts'
import type {
  GroupEngine
} from '@/engine'
import {
  createDerivedStore,
  createReadStore,
  createValueStore,
  type ReadStore
} from '@/runtime/store'
import {
  createGrouping
} from '@/engine/projection/view'
import {
  createCommands
} from './commands'
import {
  createSelectionStore
} from './selection'
import {
  syncSelection
} from './selection'
import type {
  CurrentView,
  Selection,
  SelectionStore
} from './types'
import type {
  ResolvedPageState
} from '@/react/page/session/types'

export const createCurrentViewStore = (input: {
  engine: GroupEngine
  pageStateStore: ReadStore<ResolvedPageState>
}): {
  currentView: ReadStore<CurrentView | undefined>
  dispose: () => void
} => {
  const selections = new Map<ViewId, SelectionStore>()
  const selectionReads = new Map<ViewId, ReadStore<Selection>>()
  const activeViewIdStore = createDerivedStore<ViewId | undefined>({
    get: read => read(input.pageStateStore).activeViewId
  })

  const resolve = (): CurrentView | undefined => {
    const viewId = activeViewIdStore.get()
    if (!viewId) {
      return undefined
    }

    const projection = input.engine.read.viewProjection.get(viewId)
    if (!projection) {
      return undefined
    }

    const selection = selections.get(projection.view.id) ?? createSelectionStore()
    selections.set(projection.view.id, selection)
    const selectionRead = selectionReads.get(projection.view.id) ?? createReadStore<Selection>({
      get: selection.get,
      subscribe: selection.subscribe,
      isEqual: selection.isEqual
    })
    selectionReads.set(projection.view.id, selectionRead)

    const grouping = createGrouping({
      document: input.engine.read.document.get(),
      view: projection.view,
      sections: projection.sections
    })

    syncSelection(selection, projection.appearances.ids)

    return {
      ...projection,
      selection: selectionRead,
      commands: createCommands({
        engine: input.engine,
        view: projection.view,
        appearances: projection.appearances,
        grouping,
        sections: projection.sections,
        selection
      })
    }
  }

  const store = createValueStore<CurrentView | undefined>({
    initial: resolve()
  })
  const sync = () => {
    store.set(resolve())
  }
  const unsubscribeDocument = input.engine.read.document.subscribe(sync)
  const unsubscribeActiveViewId = activeViewIdStore.subscribe(sync)

  return {
    currentView: {
      get: store.get,
      subscribe: store.subscribe
    },
    dispose: () => {
      unsubscribeDocument()
      unsubscribeActiveViewId()
    }
  }
}
