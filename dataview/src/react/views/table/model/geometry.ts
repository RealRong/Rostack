import {
  containsPoint,
  intersects,
  normalizeRect,
  type Point,
  type Rect
} from '@shared/dom'
import type { ItemId } from '@dataview/engine'

export interface TableRowRect {
  rowId: ItemId
  left: number
  top: number
  right: number
  bottom: number
  height: number
}

export interface TableRowGapHit {
  beforeId: ItemId | null
  top: number
}

export interface TableRowRangeHit {
  topRowId: ItemId
  bottomRowId: ItemId
}

export const rowIdAtPoint = (input: {
  rects: readonly TableRowRect[]
  point: Point
}): ItemId | null => (
  input.rects.find(rect => containsPoint(rect, input.point))?.rowId ?? null
)

export const rowRangeInBox = (input: {
  rects: readonly TableRowRect[]
  box: Rect | null
}): TableRowRangeHit | null => {
  if (!input.box) {
    return null
  }

  const box = normalizeRect(input.box)
  let topRowId: ItemId | null = null
  let bottomRowId: ItemId | null = null

  for (const rect of input.rects) {
    if (!intersects(box, rect)) {
      continue
    }

    topRowId ??= rect.rowId
    bottomRowId = rect.rowId
  }

  return topRowId && bottomRowId
    ? {
        topRowId,
        bottomRowId
      }
    : null
}

export const rowGapHitAtPoint = (input: {
  rects: readonly TableRowRect[]
  point: Point
}): TableRowGapHit | null => {
  if (!input.rects.length) {
    return null
  }

  for (const row of input.rects) {
    if (input.point.y <= row.top + row.height / 2) {
      return {
        beforeId: row.rowId,
        top: row.top
      }
    }
  }

  const lastRow = input.rects[input.rects.length - 1]
  return lastRow
    ? {
        beforeId: null,
        top: lastRow.bottom
      }
    : null
}
