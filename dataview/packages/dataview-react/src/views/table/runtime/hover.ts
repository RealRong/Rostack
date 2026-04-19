import {
  createKeyedDerivedStore,
  createKeyedStore,
  createProjectedStore,
  createValueStore,
  read,
  sameOptionalPoint,
  type KeyedReadStore,
  type ReadStore,
  type ValueStore
} from '@shared/core'
import type { Point } from '@shared/dom'
import type { CellRef, ItemId } from '@dataview/engine'
import {
  hoveredCellOf,
  hoveredRowIdOf,
  sameHoverTarget,
  type TableHoverTarget
} from '@dataview/react/views/table/model/hover'
import { tableCellKey } from '@dataview/react/views/table/runtime/cell'

export interface TableHoverRuntime {
  target: ReadStore<TableHoverTarget | null>
  row: KeyedReadStore<ItemId, boolean>
  cell: KeyedReadStore<CellRef, boolean>
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

export const createTableHover = (): TableHoverRuntime => {
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
  const row = createKeyedStore<ItemId, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const cellState = createKeyedStore<string, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const cell = createKeyedDerivedStore<CellRef, boolean>({
    keyOf: tableCellKey,
    get: current => read(cellState, tableCellKey(current)),
    isEqual: Object.is
  })

  const syncMembership = (
    previous: TableHoverTarget | null,
    next: TableHoverTarget | null
  ) => {
    const previousRowId = hoveredRowIdOf(previous)
    const nextRowId = hoveredRowIdOf(next)
    if (previousRowId !== nextRowId) {
      row.patch({
        ...(previousRowId !== null
          ? {
              set: [[previousRowId, false] as const]
            }
          : {}),
        ...(nextRowId !== null
          ? {
              set: [
                ...(previousRowId !== null ? [[previousRowId, false] as const] : []),
                [nextRowId, true] as const
              ]
            }
          : {})
      })
    }

    const previousCell = hoveredCellOf(previous)
    const nextCell = hoveredCellOf(next)
    const previousCellKey = previousCell
      ? tableCellKey(previousCell)
      : undefined
    const nextCellKey = nextCell
      ? tableCellKey(nextCell)
      : undefined
    if (previousCellKey === nextCellKey) {
      return
    }

    const set: Array<readonly [string, boolean]> = []
    if (previousCellKey) {
      set.push([previousCellKey, false] as const)
    }
    if (nextCellKey) {
      set.push([nextCellKey, true] as const)
    }
    if (!set.length) {
      return
    }

    cellState.patch({
      set
    })
  }

  const set = (
    target: TableHoverTarget | null,
    point: Point | null = state.get().pointer
  ) => {
    const previous = state.get().target
    if (
      sameHoverTarget(previous, target)
      && sameOptionalPoint(state.get().pointer, point)
    ) {
      return
    }

    syncMembership(previous, target)
    state.set({
      target,
      pointer: point
    })
  }

  return {
    target: createProjectedStore({
      source: state,
      select: current => current.target,
      isEqual: sameHoverTarget
    }),
    row,
    cell,
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
