import type {
  AppearanceId,
  CurrentView,
  FieldId
} from '@dataview/react/view'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table'
import {
  createValueStore,
  type ReadStore,
  type ValueStore
} from '@dataview/runtime/store'

export interface GridSelectionStore {
  store: ValueStore<GridSelection | null>
  get: () => GridSelection | null
  clear: () => void
  set: (cell: FieldId, anchor?: FieldId) => void
  move: (
    rowDelta: number,
    columnDelta: number,
    options?: {
      extend?: boolean
      wrap?: boolean
    }
  ) => void
  first: (rowId?: AppearanceId) => void
  dispose: () => void
}

export const createGridSelection = (
  currentViewStore: ReadStore<CurrentView | undefined>
): GridSelectionStore => {
  const store = createValueStore<GridSelection | null>({
    initial: null,
    isEqual: gridSelection.equal
  })
  const getCurrentView = currentViewStore.get
  const unsubscribe = currentViewStore.subscribe(() => {
    const currentView = currentViewStore.get()
    store.update(current => currentView
      ? gridSelection.reconcile(
          current,
          currentView.appearances,
          currentView.properties
        )
      : null
    )
  })

  return {
    store,
    get: store.get,
    clear: () => {
      store.set(null)
    },
    set: (cell, anchor) => {
      store.set(gridSelection.set(cell, anchor))
    },
    move: (rowDelta, columnDelta, options) => {
      const currentView = getCurrentView()
      if (!currentView) {
        return
      }

      store.update(current => gridSelection.move(
        current,
        rowDelta,
        columnDelta,
        currentView.appearances,
        currentView.properties,
        options
      ) ?? current)
    },
    first: rowId => {
      const currentView = getCurrentView()
      if (!currentView) {
        return
      }

      store.update(current => gridSelection.first(
        current,
        currentView.appearances,
        currentView.properties,
        rowId
      ) ?? null)
    },
    dispose: unsubscribe
  }
}
