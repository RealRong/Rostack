import type { Field } from '@dataview/core/contracts'
import { field as fieldApi } from '@dataview/core/field'
import type {
  ItemList,
  FieldList
} from '@dataview/engine'
import type {
  CellRef
} from '@dataview/engine'
import {
  gridSelection,
  type GridSelection
} from '@dataview/table/gridSelection'

export interface TablePasteEntry {
  cell: CellRef
  value: unknown | undefined
}

export const parseClipboardMatrix = (text: string): string[][] => {
  if (!text) {
    return []
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = normalized.split('\n')
  if (rows.length && rows[rows.length - 1] === '') {
    rows.pop()
  }

  return rows
    .map(row => row.split('\t'))
    .filter(row => row.length > 0)
}

const parseCellDraft = (
  field: Field,
  draft: string
): { ok: boolean; value?: unknown } => {
  const parsed = fieldApi.draft.parse(field, draft)
  switch (parsed.type) {
    case 'set':
      return {
        ok: true,
        value: parsed.value
      }
    case 'clear':
      return {
        ok: true,
        value: undefined
      }
    case 'invalid':
    default:
      return {
        ok: false
      }
  }
}

const planRangeBroadcast = (
  currentSelection: GridSelection | null,
  items: Pick<ItemList, 'order'>,
  fields: Pick<FieldList, 'range' | 'all'>,
  draft: string
): TablePasteEntry[] => {
  if (!currentSelection) {
    return []
  }

  const itemIds = gridSelection.itemIds(currentSelection, items)
  const fieldIds = gridSelection.fieldIds(currentSelection, fields)
  if (!itemIds.length || !fieldIds.length) {
    return []
  }

  const fieldMap = new Map(fields.all.map(field => [field.id, field] as const))

  return itemIds.flatMap(itemId => (
    fieldIds.flatMap(fieldId => {
      const field = fieldMap.get(fieldId)
      if (!field) {
        return []
      }

      const parsed = parseCellDraft(field, draft)
      if (!parsed.ok) {
        return []
      }

      return [{
        cell: {
          itemId,
          fieldId
        },
        value: parsed.value
      }]
    })
  ))
}

export const planPaste = (options: {
  selection: GridSelection | null
  items: Pick<ItemList, 'order'>
  fields: Pick<FieldList, 'indexOf' | 'all' | 'range'>
  matrix: readonly (readonly string[])[]
}): TablePasteEntry[] => {
  const anchorCell = options.selection?.anchor
  if (!anchorCell || !options.matrix.length) {
    return []
  }

  if (options.matrix.length === 1 && options.matrix[0]?.length === 1) {
    if (options.selection && !gridSelection.isSingle(options.selection, options.items, options.fields)) {
      return planRangeBroadcast(
        options.selection,
        options.items,
        options.fields,
        options.matrix[0][0] ?? ''
      )
    }
  }

  const rowStart = options.items.order.indexOf(anchorCell.itemId)
  const fieldStart = options.fields.indexOf(anchorCell.fieldId)
  if (rowStart === undefined || fieldStart === undefined) {
    return []
  }

  return options.matrix.flatMap((row, rowOffset) => {
    const itemId = options.items.order.at(rowStart + rowOffset)
    if (!itemId) {
      return []
    }

    return row.flatMap((draft, columnOffset) => {
      const field = options.fields.all[fieldStart + columnOffset]
      if (!field) {
        return []
      }

      const parsed = parseCellDraft(field, draft)
      if (!parsed.ok) {
        return []
      }

      return [{
        cell: {
          itemId,
          fieldId: field.id
        },
        value: parsed.value
      }]
    })
  })
}
