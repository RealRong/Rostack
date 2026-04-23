import type {
  ItemId
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import type {
  ItemList
} from '@dataview/engine'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table'
import { store as coreStore } from '@shared/core'
import type { TableDisplayedFields } from '@dataview/react/views/table/displayFields'


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
  itemsStore: coreStore.ReadStore<ItemList>,
  fieldsStore: coreStore.ReadStore<TableDisplayedFields | undefined>
): GridSelectionStore => {
  const selectionStore = coreStore.createValueStore<GridSelection | null>({
    initial: null,
    isEqual: gridSelection.equal
  })
  const readItems = () => coreStore.peek(itemsStore)
  const readFields = () => coreStore.peek(fieldsStore)
  const unsubscribe = coreStore.joinUnsubscribes([
    itemsStore.subscribe(() => {
      const fields = coreStore.read(fieldsStore)
      selectionStore.update(current => fields
        ? gridSelection.reconcile(
            current,
            coreStore.read(itemsStore),
            fields
          )
        : null
      )
    }),
    fieldsStore.subscribe(() => {
      const fields = coreStore.read(fieldsStore)
      selectionStore.update(current => fields
        ? gridSelection.reconcile(
            current,
            coreStore.read(itemsStore),
            fields
          )
        : null
      )
    })
  ])

  return {
    store: selectionStore,
    get: () => coreStore.peek(selectionStore),
    clear: () => {
      selectionStore.set(null)
    },
    set: (cell, anchor) => {
      selectionStore.set(gridSelection.set(cell, anchor))
    },
    move: (rowDelta, columnDelta, options) => {
      const fields = readFields()
      if (!fields) {
        return
      }

      selectionStore.update(current => gridSelection.move(
        current,
        rowDelta,
        columnDelta,
        readItems(),
        fields,
        options
      ) ?? current)
    },
    first: rowId => {
      const fields = readFields()
      if (!fields) {
        return
      }

      selectionStore.update(current => gridSelection.first(
        current,
        readItems(),
        fields,
        rowId
      ) ?? null)
    },
    dispose: unsubscribe
  }
}
