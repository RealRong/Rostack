import type {
  AppearanceId,
  AppearanceList,
  FieldId,
  PropertyList
} from '@/engine/projection/view'
import { sameField } from '@/engine/projection/view'
import {
  grid
} from './grid'

export interface GridSelection {
  focus: FieldId
  anchor: FieldId
}

const equal = (
  left: GridSelection | null,
  right: GridSelection | null
) => {
  if (!left || !right) {
    return left === right
  }

  return sameField(left.focus, right.focus) && sameField(left.anchor, right.anchor)
}

const set = (
  focus: FieldId,
  anchor: FieldId = focus
): GridSelection => ({
  focus,
  anchor
})

const focus = (
  current: GridSelection | null
): FieldId | undefined => current?.focus

const anchor = (
  current: GridSelection | null
): FieldId | undefined => current?.anchor

const reconcile = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'has' | 'indexOf' | 'ids' | 'at'>,
  properties: Pick<PropertyList, 'has' | 'ids' | 'at'>
): GridSelection | null => {
  if (!current) {
    return null
  }

  if (!appearances.has(current.focus.appearanceId)) {
    return null
  }

  const focusCell = properties.has(current.focus.propertyId)
    ? current.focus
    : grid.firstCell(appearances, properties, current.focus.appearanceId)
  if (!focusCell) {
    return null
  }

  const anchorCell = (
    appearances.has(current.anchor.appearanceId)
    && properties.has(current.anchor.propertyId)
  )
    ? current.anchor
    : focusCell

  return set(focusCell, anchorCell)
}

const first = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'ids' | 'has' | 'indexOf' | 'at'>,
  properties: Pick<PropertyList, 'ids' | 'at'>,
  appearanceId?: AppearanceId
): GridSelection | undefined => {
  const targetCell = grid.firstCell(
    appearances,
    properties,
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
  properties: Pick<PropertyList, 'ids' | 'indexOf' | 'at'>,
  options?: {
    extend?: boolean
    wrap?: boolean
  }
): GridSelection | undefined => {
  if (!current || !appearances.ids.length || !properties.ids.length) {
    return undefined
  }

  const nextFocus = grid.stepField(
    appearances,
    properties,
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
