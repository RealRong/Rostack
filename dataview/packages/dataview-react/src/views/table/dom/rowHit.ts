import type { RefObject } from 'react'
import {
  elementRectIn,
  pointIn,
  type Point,
  type Rect
} from '@shared/dom'
import type { ItemId } from '@dataview/engine'
import {
  rowGapHitAtPoint,
  rowIdAtPoint,
  rowRangeInBox,
  type TableRowGapHit,
  type TableRowRangeHit,
  type TableRowRect
} from '@dataview/react/views/table/model/geometry'
import type { Nodes } from '@dataview/react/views/table/dom/registry'

const emptyRowRects = [] as readonly TableRowRect[]

const collectRowRects = (input: {
  container: HTMLElement | null | undefined
  nodes?: Nodes
  rowIds: readonly ItemId[]
  left?: number
}): readonly TableRowRect[] => {
  const container = input.container
  if (!container || !input.rowIds.length) {
    return emptyRowRects
  }

  const rowOrder = new Map(
    input.rowIds.map((rowId, index) => [rowId, index] as const)
  )
  const mountedRows = input.nodes
    ? input.nodes.rows(input.rowIds)
    : Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]'))

  return mountedRows
    .flatMap(node => {
      const rowId = node.dataset.rowId as ItemId | undefined
      if (!rowId || !rowOrder.has(rowId)) {
        return []
      }

      const rect = elementRectIn(container, node)

      return [{
        rowId,
        left: typeof input.left === 'number'
          ? Math.min(rect.left, input.left)
          : rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        height: rect.height
      }]
    })
    .sort((left, right) => (
      (rowOrder.get(left.rowId) ?? Number.MAX_SAFE_INTEGER)
      - (rowOrder.get(right.rowId) ?? Number.MAX_SAFE_INTEGER)
    ))
}

export const mountedRowIdAtPoint = (input: {
  container: HTMLElement | null | undefined
  nodes?: Nodes
  rowIds: readonly ItemId[]
  point: Point | null
}): ItemId | null => {
  const container = input.container
  const point = input.point
  if (!container || !point) {
    return null
  }

  return rowIdAtPoint({
    rects: collectRowRects({
      container,
      nodes: input.nodes,
      rowIds: input.rowIds,
      left: 0
    }),
    point: pointIn(container, point)
  })
}

export const mountedRowRangeInBox = (input: {
  container: HTMLElement | null | undefined
  nodes?: Nodes
  rowIds: readonly ItemId[]
  box: Rect | null
}): TableRowRangeHit | null => {
  const container = input.container
  if (!container) {
    return null
  }

  return rowRangeInBox({
    rects: collectRowRects({
      container,
      nodes: input.nodes,
      rowIds: input.rowIds
    }),
    box: input.box
  })
}

export const mountedRowGapAtPoint = (input: {
  container: HTMLElement | null | undefined
  nodes?: Nodes
  rowIds: readonly ItemId[]
  point: Point | null
}): TableRowGapHit | null => {
  const container = input.container
  const point = input.point
  if (!container || !point) {
    return null
  }

  return rowGapHitAtPoint({
    rects: collectRowRects({
      container,
      nodes: input.nodes,
      rowIds: input.rowIds
    }),
    point: pointIn(container, point)
  })
}

export interface RowHit {
  idAtPoint: (input: {
    rowIds: readonly ItemId[]
    point: Point | null
  }) => ItemId | null
  gapAtPoint: (input: {
    rowIds: readonly ItemId[]
    point: Point | null
  }) => TableRowGapHit | null
}

export const createRowHit = (options: {
  containerRef: RefObject<HTMLDivElement | null>
  nodes: Nodes
}): RowHit => ({
  idAtPoint: input => mountedRowIdAtPoint({
    container: options.containerRef.current,
    nodes: options.nodes,
    rowIds: input.rowIds,
    point: input.point
  }),
  gapAtPoint: input => mountedRowGapAtPoint({
    container: options.containerRef.current,
    nodes: options.nodes,
    rowIds: input.rowIds,
    point: input.point
  })
})
