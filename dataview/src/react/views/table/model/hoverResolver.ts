import type { Point } from '@dataview/dom/geometry'
import type { TableHoverTarget } from './hover'

export interface RowHoverFallbackPolicy {
  withinContainer: boolean
  overBlockingOverlay: boolean
  overGroupRow: boolean
  overColumn: boolean
}

export const canFallbackToRowHover = (
  input: RowHoverFallbackPolicy
) => (
  input.withinContainer
  && !input.overBlockingOverlay
  && !input.overGroupRow
  && !input.overColumn
)

export const resolveHoverTargetFromPoint = <TElement,>(input: {
  point: Point | null
  elementAtPoint: (point: Point) => TElement | null
  targetFromElement: (element: TElement | null) => TableHoverTarget | null
  allowsRowFallback: (element: TElement | null) => boolean
  rowTargetFromPoint: (point: Point) => TableHoverTarget | null
}): TableHoverTarget | null => {
  if (!input.point) {
    return null
  }

  const element = input.elementAtPoint(input.point)
  const target = input.targetFromElement(element)
  if (target) {
    return target
  }

  if (!input.allowsRowFallback(element)) {
    return null
  }

  return input.rowTargetFromPoint(input.point)
}
