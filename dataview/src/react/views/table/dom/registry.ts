import type { CustomFieldId } from '@dataview/core/contracts'
import {
  elementRectIn,
  intersects,
  rectIn,
  type Rect
} from '@shared/dom'
import type {
  ItemId
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'

const cellKey = (cell: {
  itemId: ItemId
  fieldId: CustomFieldId
}) => `${cell.itemId}\u0000${cell.fieldId}`

export interface Nodes {
  column: (fieldId: CustomFieldId) => HTMLElement | null
  row: (rowId: ItemId) => HTMLElement | null
  cell: (cell: {
    itemId: ItemId
    fieldId: CustomFieldId
  }) => HTMLElement | null
  columns: (fieldIds: readonly CustomFieldId[]) => readonly HTMLElement[]
  rows: (rowIds: readonly ItemId[]) => readonly HTMLElement[]
  registerColumn: (
    fieldId: CustomFieldId,
    node: HTMLElement | null
  ) => void
  registerRow: (
    rowId: ItemId,
    node: HTMLElement | null
  ) => void
  startRowMarquee: (rowIds: readonly ItemId[]) => void
  endRowMarquee: () => void
  hitRows: (
    rowIds: readonly ItemId[],
    box: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>
  ) => readonly ItemId[]
  registerCell: (
    cell: CellRef,
    node: HTMLElement | null
  ) => void
}

export const createNodes = (options?: {
  resolveContainer?: () => HTMLElement | null
  resolveHorizontalBounds?: () => {
    left: number
    right: number
  } | null
}): Nodes => {
  const columnNodes = new Map<CustomFieldId, HTMLElement>()
  const rowNodes = new Map<ItemId, HTMLElement>()
  const rowRects = new Map<ItemId, Rect>()
  const cellNodes = new Map<string, HTMLElement>()
  let marqueeActive = false

  const measureRow = (
    rowId: ItemId,
    node: HTMLElement
  ): Rect | null => {
    const container = options?.resolveContainer?.()
    if (!container) {
      return null
    }

    const rect = elementRectIn(container, node)
    rowRects.set(rowId, rect)
    return rect
  }

  const cachedRowRect = (
    rowId: ItemId
  ): Rect | null => {
    const cached = rowRects.get(rowId)
    if (cached) {
      return cached
    }

    const node = rowNodes.get(rowId)
    return node
      ? measureRow(rowId, node)
      : null
  }

  const localBox = (
    box: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>
  ): Rect | null => {
    const container = options?.resolveContainer?.()
    if (!container) {
      return null
    }

    return rectIn(container, box)
  }

  const resolveHorizontalBounds = () => options?.resolveHorizontalBounds?.()

  const resolvedRowRect = (
    rect: Rect
  ): Rect => {
    const bounds = resolveHorizontalBounds()
    if (!bounds) {
      return rect
    }

    return {
      ...rect,
      left: bounds.left,
      right: bounds.right,
      width: Math.max(0, bounds.right - bounds.left)
    }
  }

  return {
    column: fieldId => columnNodes.get(fieldId) ?? null,
    row: rowId => rowNodes.get(rowId) ?? null,
    cell: cell => cellNodes.get(cellKey(cell)) ?? null,
    columns: fieldIds => fieldIds.flatMap(fieldId => {
      const node = columnNodes.get(fieldId)
      return node ? [node] : []
    }),
    rows: rowIds => rowIds.flatMap(rowId => {
      const node = rowNodes.get(rowId)
      return node ? [node] : []
    }),
    registerColumn: (fieldId, node) => {
      if (!node) {
        columnNodes.delete(fieldId)
        return
      }

      columnNodes.set(fieldId, node)
    },
    registerRow: (rowId, node) => {
      if (!node) {
        rowNodes.delete(rowId)
        if (!marqueeActive) {
          rowRects.delete(rowId)
        }
        return
      }

      rowNodes.set(rowId, node)
      if (marqueeActive) {
        measureRow(rowId, node)
      }
    },
    startRowMarquee: rowIds => {
      marqueeActive = true
      rowRects.clear()
      rowIds.forEach(rowId => {
        const node = rowNodes.get(rowId)
        if (node) {
          measureRow(rowId, node)
        }
      })
    },
    endRowMarquee: () => {
      marqueeActive = false
      rowRects.clear()
    },
    hitRows: (rowIds, box) => {
      const local = localBox(box)
      if (!local) {
        return []
      }

      return rowIds.filter(rowId => {
        const rect = cachedRowRect(rowId)
        return rect
          ? intersects(local, resolvedRowRect(rect))
          : false
      })
    },
    registerCell: (cell, node) => {
      const key = cellKey(cell)
      if (!node) {
        cellNodes.delete(key)
        return
      }

      cellNodes.set(key, node)
    }
  }
}
