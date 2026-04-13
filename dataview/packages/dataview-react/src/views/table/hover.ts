import {
  createKeyedDerivedStore,
  createValueStore,
  read,
  type KeyedReadStore,
  type ValueStore
} from '@shared/core'
import type { Point } from '@shared/dom'
import {
  sameOptionalPoint
} from '@shared/core'
import type {
  ItemId
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  hoveredCellOf,
  hoveredRowIdOf,
  sameHoverTarget,
  type TableHoverTarget
} from '#react/views/table/model/hover'

export interface Hover {
  cell: KeyedReadStore<CellRef, boolean>
  row: KeyedReadStore<ItemId, boolean>
  get: () => TableHoverTarget | null
  point: () => Point | null
  set: (
    target: TableHoverTarget | null,
    point?: Point | null
  ) => void
  clear: (point?: Point | null) => void
}

interface HoverState {
  target: TableHoverTarget | null
  pointer: Point | null
}

const cellKey = (cell: CellRef) => `${cell.itemId}\u0000${cell.fieldId}`

export const createHover = (): Hover => {
  const state: ValueStore<HoverState> = createValueStore<HoverState>({
    initial: {
      target: null,
      pointer: null
    },
    isEqual: (left, right) => (
      sameHoverTarget(left.target, right.target)
      && sameOptionalPoint(left.pointer, right.pointer)
    )
  })

  const set = (
    target: TableHoverTarget | null,
    point: Point | null = state.get().pointer
  ) => {
    state.set({
      target,
      pointer: point
    })
  }

  return {
    cell: createKeyedDerivedStore<CellRef, boolean>({
      keyOf: cellKey,
      get: (cell) => {
        const hoveredCell = hoveredCellOf(read(state).target)
        if (!hoveredCell) {
          return false
        }

        return hoveredCell.itemId === cell.itemId
          && hoveredCell.fieldId === cell.fieldId
      },
      isEqual: Object.is
    }),
    row: createKeyedDerivedStore<ItemId, boolean>({
      keyOf: rowId => rowId,
      get: (rowId) => hoveredRowIdOf(read(state).target) === rowId,
      isEqual: Object.is
    }),
    get: () => state.get().target,
    point: () => state.get().pointer,
    set,
    clear: point => {
      const current = state.get()
      set(
        null,
        point === undefined
          ? current.pointer
          : point
      )
    }
  }
}
