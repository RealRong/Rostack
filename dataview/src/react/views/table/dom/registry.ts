import type { PropertyId } from '@dataview/core/contracts'
import type {
  AppearanceId,
  FieldId
} from '@dataview/react/currentView'

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
  registerCell: (
    cell: FieldId,
    node: HTMLElement | null
  ) => void
}

export const createNodes = (): Nodes => {
  const columnNodes = new Map<PropertyId, HTMLElement>()
  const rowNodes = new Map<AppearanceId, HTMLElement>()
  const cellNodes = new Map<string, HTMLElement>()

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
        return
      }

      rowNodes.set(rowId, node)
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
