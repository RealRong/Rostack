import type {
  AppearanceId,
  AppearanceList,
  FieldList
} from '@dataview/engine/project'
import type {
  CellRef
} from '@dataview/engine/project'
import { sameCellRef } from '@dataview/engine/project'
import {
  grid
} from './grid'

export interface GridSelection {
  focus: CellRef
  anchor: CellRef
}

const equal = (
  left: GridSelection | null,
  right: GridSelection | null
) => {
  if (!left || !right) {
    return left === right
  }

  return sameCellRef(left.focus, right.focus) && sameCellRef(left.anchor, right.anchor)
}

const set = (
  focus: CellRef,
  anchor: CellRef = focus
): GridSelection => ({
  focus,
  anchor
})

const focus = (
  current: GridSelection | null
): CellRef | undefined => current?.focus

const anchor = (
  current: GridSelection | null
): CellRef | undefined => current?.anchor

const reconcile = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'has' | 'indexOf' | 'ids' | 'at'>,
  fields: Pick<FieldList, 'has' | 'ids' | 'at'>
): GridSelection | null => {
  if (!current) {
    return null
  }

  if (!appearances.has(current.focus.appearanceId)) {
    return null
  }

  const focusCell = fields.has(current.focus.fieldId)
    ? current.focus
    : grid.firstCell(appearances, fields, current.focus.appearanceId)
  if (!focusCell) {
    return null
  }

  const anchorCell = (
    appearances.has(current.anchor.appearanceId)
    && fields.has(current.anchor.fieldId)
  )
    ? current.anchor
    : focusCell

  return set(focusCell, anchorCell)
}

const first = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'ids' | 'has' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'at'>,
  appearanceId?: AppearanceId
): GridSelection | undefined => {
  const targetCell = grid.firstCell(
    appearances,
    fields,
    appearanceId ?? current?.focus.appearanceId
  )
  return targetCell
    ? set(targetCell)
    : undefined
}

const move = (
  current: GridSelection | null,
  rowDelta: number,
  columnDelta: number,
  appearances: Pick<AppearanceList, 'ids' | 'indexOf' | 'at'>,
  fields: Pick<FieldList, 'ids' | 'indexOf' | 'at'>,
  options?: {
    extend?: boolean
    wrap?: boolean
  }
): GridSelection | undefined => {
  if (!current || !appearances.ids.length || !fields.ids.length) {
    return undefined
  }

  const nextFocus = grid.stepField(
    appearances,
    fields,
    options?.extend ? current.focus : current.anchor,
    {
      rowDelta,
      columnDelta,
      wrap: options?.wrap
    }
  )
  if (!nextFocus) {
    return undefined
  }

  return options?.extend
    ? set(nextFocus, current.anchor)
    : set(nextFocus)
}

export const gridSelection = {
  equal,
  set,
  focus,
  anchor,
  reconcile,
  first,
  move
} as const
