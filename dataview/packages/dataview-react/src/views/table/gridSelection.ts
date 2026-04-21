import type { ViewState as CurrentView } from '@dataview/engine'
import type {
  ItemId
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table'
import { store as coreStore } from '@shared/core'


export interface GridSelectionStore {
  store: coreStore.ValueStore<GridSelection | null>
  get: () => GridSelection | null
  clear: () => void
  set: (cell: CellRef, anchor?: CellRef) => void
  move: (
    rowDelta: number,
    columnDelta: number,
    options?: {
      extend?: boolean
      wrap?: boolean
    }
  ) => void
  first: (rowId?: ItemId) => void
  dispose: () => void
}

export const createGridSelection = (
  currentViewStore: coreStore.ReadStore<CurrentView | undefined>
): GridSelectionStore => {
  const selectionStore = coreStore.createValueStore<GridSelection | null>({
    initial: null,
    isEqual: gridSelection.equal
  })
  const getCurrentView = currentViewStore.get
  const unsubscribe = currentViewStore.subscribe(() => {
    const currentView = currentViewStore.get()
    selectionStore.update(current => currentView
      ? gridSelection.reconcile(
          current,
          currentView.items,
          currentView.fields
        )
      : null
    )
  })

  return {
    store: selectionStore,
    get: selectionStore.get,
    clear: () => {
      selectionStore.set(null)
    },
    set: (cell, anchor) => {
      selectionStore.set(gridSelection.set(cell, anchor))
    },
    move: (rowDelta, columnDelta, options) => {
      const currentView = getCurrentView()
      if (!currentView) {
        return
      }

      selectionStore.update(current => gridSelection.move(
        current,
        rowDelta,
        columnDelta,
        currentView.items,
        currentView.fields,
        options
      ) ?? current)
    },
    first: rowId => {
      const currentView = getCurrentView()
      if (!currentView) {
        return
      }

      selectionStore.update(current => gridSelection.first(
        current,
        currentView.items,
        currentView.fields,
        rowId
      ) ?? null)
    },
    dispose: unsubscribe
  }
}
