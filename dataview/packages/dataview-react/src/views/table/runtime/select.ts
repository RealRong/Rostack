import { store as coreStore } from '@shared/core'
import type { CellRef, ItemId, ItemList } from '@dataview/engine'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table'
import type { GridSelectionEdges } from '@dataview/table/gridSelection'
import {
  tableCell,
  tableCellKey
} from '@dataview/runtime'
import type { TableDisplayedFields } from '@dataview/react/views/table/displayFields'

export interface TableSelectRuntime {
  rows: coreStore.KeyedReadStore<ItemId, boolean>
  cells: {
    state: coreStore.ReadStore<GridSelection | null>
    range: coreStore.ReadStore<GridSelectionEdges | undefined>
    visible: coreStore.ReadStore<boolean>
    cursor: coreStore.ReadStore<CellRef | undefined>
    selected: coreStore.KeyedReadStore<CellRef, boolean>
    focus: coreStore.KeyedReadStore<CellRef, boolean>
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
  items: ItemList,
  fields: TableDisplayedFields | undefined
) => {
  if (!selection || !fields) {
    return new Set<string>()
  }

  const itemIds = gridSelection.itemIds(selection, items)
  const fieldIds = gridSelection.fieldIds(selection, fields)
  const keys = new Set<string>()
  itemIds.forEach(itemId => {
    fieldIds.forEach(fieldId => {
      keys.add(tableCellKey(tableCell(itemId, fieldId)))
    })
  })
  return keys
}

const patchBooleanKeyedMembership = (
  membershipStore: ReturnType<typeof coreStore.createKeyedStore<string, boolean>>,
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

  membershipStore.patch({
    set
  })
}

export const createTableSelectRuntime = (input: {
  rowMembershipStore: coreStore.KeyedReadStore<ItemId, boolean>
  previewMembershipStore: coreStore.KeyedReadStore<ItemId, boolean | null>
  gridSelectionStore: coreStore.ReadStore<GridSelection | null>
  itemsStore: coreStore.ReadStore<ItemList>
  fieldsStore: coreStore.ReadStore<TableDisplayedFields | undefined>
  visibleStore: coreStore.ReadStore<boolean>
}): TableSelectRuntime => {
  const rows = coreStore.createKeyedDerivedStore<ItemId, boolean>({
    keyOf: rowId => rowId,
    get: rowId => {
      const preview = coreStore.read(input.previewMembershipStore, rowId)
      return preview ?? coreStore.read(input.rowMembershipStore, rowId)
    },
    isEqual: Object.is
  })
  const range = coreStore.createDerivedStore<GridSelectionEdges | undefined>({
    get: () => {
      const fields = coreStore.read(input.fieldsStore)
      const selection = coreStore.read(input.gridSelectionStore)
      return fields && selection
        ? gridSelection.edges(selection, coreStore.read(input.itemsStore), fields)
        : undefined
    },
    isEqual: sameRange
  })
  const cursor = coreStore.createDerivedStore<CellRef | undefined>({
    get: () => gridSelection.focus(coreStore.read(input.gridSelectionStore)),
    isEqual: (left, right) => (
      left?.itemId === right?.itemId
      && left?.fieldId === right?.fieldId
    )
  })
  const selectedState = coreStore.createKeyedStore<string, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const focusState = coreStore.createKeyedStore<string, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const selected = coreStore.createKeyedDerivedStore<CellRef, boolean>({
    keyOf: tableCellKey,
    get: cell => coreStore.read(selectedState, tableCellKey(cell)),
    isEqual: Object.is
  })
  const focus = coreStore.createKeyedDerivedStore<CellRef, boolean>({
    keyOf: tableCellKey,
    get: cell => coreStore.read(focusState, tableCellKey(cell)),
    isEqual: Object.is
  })

  let selectedKeys = new Set<string>()
  let focusKey: string | undefined

  const sync = () => {
    const items = coreStore.peek(input.itemsStore)
    const fields = coreStore.peek(input.fieldsStore)
    const selection = coreStore.peek(input.gridSelectionStore)
    const nextSelectedKeys = collectCellKeys(
      selection,
      items,
      fields
    )
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
    dispose: coreStore.joinUnsubscribes([
      input.itemsStore.subscribe(sync),
      input.fieldsStore.subscribe(sync),
      input.gridSelectionStore.subscribe(sync)
    ])
  }
}
