import type { PropertyId } from '@dataview/core/contracts'
import {
  elementRectIn,
  intersects,
  rectIn,
  type Rect
} from '@dataview/dom/geometry'
import type {
  AppearanceId,
  FieldId
} from '@dataview/react/runtime/currentView'

const cellKey = (cell: {
  appearanceId: AppearanceId
  propertyId: PropertyId
}) => `${cell.appearanceId}\u0000${cell.propertyId}`

export interface Nodes {
  column: (propertyId: PropertyId) => HTMLElement | null
  row: (rowId: AppearanceId) => HTMLElement | null
  cell: (cell: {
    appearanceId: AppearanceId
    propertyId: PropertyId
  }) => HTMLElement | null
  columns: (propertyIds: readonly PropertyId[]) => readonly HTMLElement[]
  rows: (rowIds: readonly AppearanceId[]) => readonly HTMLElement[]
  registerColumn: (
    propertyId: PropertyId,
    node: HTMLElement | null
  ) => void
  registerRow: (
    rowId: AppearanceId,
    node: HTMLElement | null
  ) => void
  startRowMarquee: (rowIds: readonly AppearanceId[]) => void
  endRowMarquee: () => void
  hitRows: (
    rowIds: readonly AppearanceId[],
    box: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>
  ) => readonly AppearanceId[]
  registerCell: (
    cell: FieldId,
    node: HTMLElement | null
  ) => void
}

export const createNodes = (options?: {
  resolveContainer?: () => HTMLElement | null
}): Nodes => {
  const columnNodes = new Map<PropertyId, HTMLElement>()
  const rowNodes = new Map<AppearanceId, HTMLElement>()
  const rowRects = new Map<AppearanceId, Rect>()
  const cellNodes = new Map<string, HTMLElement>()
  let marqueeActive = false

  const measureRow = (
    rowId: AppearanceId,
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
    rowId: AppearanceId
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

  return {
    column: propertyId => columnNodes.get(propertyId) ?? null,
    row: rowId => rowNodes.get(rowId) ?? null,
    cell: cell => cellNodes.get(cellKey(cell)) ?? null,
    columns: propertyIds => propertyIds.flatMap(propertyId => {
      const node = columnNodes.get(propertyId)
      return node ? [node] : []
    }),
    rows: rowIds => rowIds.flatMap(rowId => {
      const node = rowNodes.get(rowId)
      return node ? [node] : []
    }),
    registerColumn: (propertyId, node) => {
      if (!node) {
        columnNodes.delete(propertyId)
        return
      }

      columnNodes.set(propertyId, node)
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
          ? intersects(local, rect)
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
