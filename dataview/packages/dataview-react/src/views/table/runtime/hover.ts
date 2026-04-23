import { equal, store } from '@shared/core'
import type { Point } from '@shared/dom'
import type { CellRef, ItemId } from '@dataview/engine'
import {
  cellId,
  type CellId
} from '@dataview/runtime'
import {
  hoveredCellOf,
  hoveredRowIdOf,
  sameHoverTarget,
  type TableHoverTarget
} from '@dataview/react/views/table/model/hover'

export interface TableHoverRuntime {
  target: store.ReadStore<TableHoverTarget | null>
  row: store.KeyedReadStore<ItemId, boolean>
  cell: store.KeyedReadStore<CellRef, boolean>
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
  const state: store.ValueStore<HoverState> = store.createValueStore<HoverState>({
    initial: {
      target: null,
      pointer: null
    },
    isEqual: (left, right) => (
      sameHoverTarget(left.target, right.target)
      && equal.sameOptionalPoint(left.pointer, right.pointer)
    )
  })
  const row = store.createKeyedStore<ItemId, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const cellState = store.createKeyedStore<CellId, boolean>({
    emptyValue: false,
    isEqual: Object.is
  })
  const cell = store.createKeyedDerivedStore<CellRef, boolean>({
    keyOf: cellId,
    get: current => store.read(cellState, cellId(current)),
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
      ? cellId(previousCell)
      : undefined
    const nextCellKey = nextCell
      ? cellId(nextCell)
      : undefined
    if (previousCellKey === nextCellKey) {
      return
    }

    const set: Array<readonly [CellId, boolean]> = []
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
    point: Point | null = store.peek(state).pointer
  ) => {
    const current = store.peek(state)
    const previous = current.target
    if (
      sameHoverTarget(previous, target)
      && equal.sameOptionalPoint(current.pointer, point)
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
    target: store.createProjectedStore({
      source: state,
      select: current => current.target,
      isEqual: sameHoverTarget
    }),
    row,
    cell,
    get: () => store.peek(state).target,
    point: () => store.peek(state).pointer,
    set,
    clear: point => {
      const current = store.peek(state)
      set(
        null,
        point === undefined
          ? current.pointer
          : point
      )
    }
  }
}
