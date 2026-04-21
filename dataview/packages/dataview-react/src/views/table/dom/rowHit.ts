import type { RefObject } from 'react'
import {
  elementRectIn,
  pointIn,
  type Point,
  type Rect
} from '@shared/dom'
import type { ItemId } from '@dataview/engine'
import {
  itemDomBridge
} from '@dataview/react/dom/item'
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

  return input.nodes
    ? input.rowIds.flatMap(rowId => {
        const node = input.nodes?.row(rowId)
        if (!node) {
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
    : Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]'))
      .flatMap(node => {
        const rowId = itemDomBridge.read.node(node) ?? Number(node.dataset.rowId)
        if (!Number.isFinite(rowId)) {
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
