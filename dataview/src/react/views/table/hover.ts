import {
  createKeyedDerivedStore,
  createValueStore,
  type KeyedReadStore,
  type ValueStore
} from '@shared/store'
import type { Point } from '@shared/dom'
import type {
  AppearanceId,
  CellRef
} from '@dataview/react/runtime/currentView'
import {
  hoveredCellOf,
  hoveredRowIdOf,
  sameHoverTarget,
  type TableHoverTarget
} from './model/hover'

export interface Hover {
  cell: KeyedReadStore<CellRef, boolean>
  row: KeyedReadStore<AppearanceId, boolean>
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

const cellKey = (cell: CellRef) => `${cell.appearanceId}\u0000${cell.fieldId}`

const samePoint = (
  left: Point | null,
  right: Point | null
) => {
  if (!left || !right) {
    return left === right
  }

  return left.x === right.x && left.y === right.y
}

export const createHover = (): Hover => {
  const state: ValueStore<HoverState> = createValueStore<HoverState>({
    initial: {
      target: null,
      pointer: null
    },
    isEqual: (left, right) => (
      sameHoverTarget(left.target, right.target)
      && samePoint(left.pointer, right.pointer)
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
      get: (read, cell) => {
        const hoveredCell = hoveredCellOf(read(state).target)
        if (!hoveredCell) {
          return false
        }

        return hoveredCell.appearanceId === cell.appearanceId
          && hoveredCell.fieldId === cell.fieldId
      },
      isEqual: Object.is
    }),
    row: createKeyedDerivedStore<AppearanceId, boolean>({
      keyOf: rowId => rowId,
      get: (read, rowId) => hoveredRowIdOf(read(state).target) === rowId,
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
