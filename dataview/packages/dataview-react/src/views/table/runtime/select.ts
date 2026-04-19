import {
  createDerivedStore,
  createKeyedDerivedStore,
  createKeyedStore,
  joinUnsubscribes,
  read,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { CellRef, ItemId, ViewState as CurrentView } from '@dataview/engine'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table'
import type { GridSelectionEdges } from '@dataview/table/gridSelection'
import { tableCell, tableCellKey } from '@dataview/react/views/table/runtime/cell'

export interface TableSelectRuntime {
  rows: KeyedReadStore<ItemId, boolean>
  cells: {
    state: ReadStore<GridSelection | null>
    range: ReadStore<GridSelectionEdges | undefined>
    visible: ReadStore<boolean>
    cursor: ReadStore<CellRef | undefined>
    selected: KeyedReadStore<CellRef, boolean>
    focus: KeyedReadStore<CellRef, boolean>
  }
  dispose: () => void
}

const sameRange = (
  left: GridSelectionEdges | undefined,
  right: GridSelectionEdges | undefined
) => left?.rowStart === right?.rowStart
  && left?.rowEnd === right?.rowEnd
  && left?.fieldStart === right?.fieldStart
  && left?.fieldEnd === right?.fieldEnd

const collectCellKeys = (
  selection: GridSelection | null,
  currentView: Pick<CurrentView, 'items' | 'fields'> | undefined
) => {
  if (!selection || !currentView) {
    return new Set<string>()
  }

  const itemIds = gridSelection.itemIds(selection, currentView.items)
  const fieldIds = gridSelection.fieldIds(selection, currentView.fields)
  const keys = new Set<string>()
  itemIds.forEach(itemId => {
    fieldIds.forEach(fieldId => {
      keys.add(tableCellKey(tableCell(itemId, fieldId)))
    })
  })
  return keys
}

const patchBooleanKeyedMembership = (
  store: ReturnType<typeof createKeyedStore<string, boolean>>,
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>
) => {
  const set: Array<readonly [string, boolean]> = []
  previous.forEach(key => {
    if (!next.has(key)) {
      set.push([key, false] as const)
    }
  })
  next.forEach(key => {
    if (!previous.has(key)) {
      set.push([key, true] as const)
    }
  })
  if (!set.length) {
    return
  }

  store.patch({
    set
  })
}

export const createTableSelectRuntime = (input: {
  rowMembershipStore: KeyedReadStore<ItemId, boolean>
  previewMembershipStore: KeyedReadStore<ItemId, boolean | null>
  gridSelectionStore: ReadStore<GridSelection | null>
  currentViewStore: ReadStore<CurrentView | undefined>
  visibleStore: ReadStore<boolean>
}): TableSelectRuntime => {
  const rows = createKeyedDerivedStore<ItemId, boolean>({
    keyOf: rowId => rowId,
    get: rowId => {
      const preview = read(input.previewMembershipStore, rowId)
      return preview ?? read(input.rowMembershipStore, rowId)
    },
    isEqual: Object.is
  })
  const range = createDerivedStore<GridSelectionEdges | undefined>({
    get: () => {
      const current = read(input.currentViewStore)
      const selection = read(input.gridSelectionStore)
      return current && selection
        ? gridSelection.edges(selection, current.items, current.fields)
        : undefined
    },
    isEqual: sameRange
  })
  const cursor = createDerivedStore<CellRef | undefined>({
    get: () => gridSelection.focus(read(input.gridSelectionStore)),
    isEqual: (left, right) => (
      left?.itemId === right?.itemId
      && left?.fieldId === right?.fieldId
    )
  })
  const selectedState = createKeyedStore<string, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const focusState = createKeyedStore<string, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const selected = createKeyedDerivedStore<CellRef, boolean>({
    keyOf: tableCellKey,
    get: cell => read(selectedState, tableCellKey(cell)),
    isEqual: Object.is
  })
  const focus = createKeyedDerivedStore<CellRef, boolean>({
    keyOf: tableCellKey,
    get: cell => read(focusState, tableCellKey(cell)),
    isEqual: Object.is
  })

  let selectedKeys = new Set<string>()
  let focusKey: string | undefined

  const sync = () => {
    const currentView = input.currentViewStore.get()
    const selection = input.gridSelectionStore.get()
    const nextSelectedKeys = collectCellKeys(selection, currentView)
    patchBooleanKeyedMembership(
      selectedState,
      selectedKeys,
      nextSelectedKeys
    )
    selectedKeys = nextSelectedKeys

    const nextCursor = selection
      ? gridSelection.focus(selection)
      : undefined
    const nextFocusKey = nextCursor
      ? tableCellKey(nextCursor)
      : undefined
    if (focusKey !== nextFocusKey) {
      const set: Array<readonly [string, boolean]> = []
      if (focusKey) {
        set.push([focusKey, false] as const)
      }
      if (nextFocusKey) {
        set.push([nextFocusKey, true] as const)
      }
      if (set.length) {
        focusState.patch({
          set
        })
      }
      focusKey = nextFocusKey
    }
  }

  sync()

  return {
    rows,
    cells: {
      state: input.gridSelectionStore,
      range,
      visible: input.visibleStore,
      cursor,
      selected,
      focus
    },
    dispose: joinUnsubscribes([
      input.currentViewStore.subscribe(sync),
      input.gridSelectionStore.subscribe(sync)
    ])
  }
}
