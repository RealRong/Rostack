import {
  containsPoint,
  intersects,
  normalizeRect,
  type Point,
  type Rect
} from '@dataview/dom/geometry'
import type { AppearanceId } from '@dataview/react/runtime/currentView'

export interface TableRowRect {
  rowId: AppearanceId
  left: number
  top: number
  right: number
  bottom: number
  height: number
}

export interface TableRowGapHit {
  beforeId: AppearanceId | null
  top: number
}

export interface TableRowRangeHit {
  topRowId: AppearanceId
  bottomRowId: AppearanceId
}

export const rowIdAtPoint = (input: {
  rects: readonly TableRowRect[]
  point: Point
}): AppearanceId | null => (
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
  let topRowId: AppearanceId | null = null
  let bottomRowId: AppearanceId | null = null

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
