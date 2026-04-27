import type { CustomFieldId } from '@dataview/core/types'
import type { ItemId } from '@dataview/engine'
import type { CellRef } from '@dataview/engine'

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
  registerCell: (
    cell: CellRef,
    node: HTMLElement | null
  ) => void
}

export const createNodes = (): Nodes => {
  const columnNodes = new Map<CustomFieldId, HTMLElement>()
  const rowNodes = new Map<ItemId, HTMLElement>()
  const cellNodes = new Map<string, HTMLElement>()

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
