import type { Field } from '@dataview/core/contracts'
import { parseFieldDraft } from '@dataview/core/field'
import type {
  AppearanceList,
  CellRef,
  FieldList
} from '@dataview/engine/project'
import {
  grid
} from './grid'
import {
  type GridSelection
} from './gridSelection'
import { range } from './range'

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
  const parsed = parseFieldDraft(field, draft)
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
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  fields: FieldList,
  draft: string
): TablePasteEntry[] => {
  const currentRange = range.from(currentSelection)
  if (!currentRange) {
    return []
  }

  const appearanceIds = range.appearances(currentRange, appearances)
  const fieldIds = range.fields(currentRange, fields)
  if (!appearanceIds.length || !fieldIds.length) {
    return []
  }

  const fieldMap = new Map(fields.all.map(field => [field.id, field] as const))

  return appearanceIds.flatMap(appearanceId => (
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
          appearanceId,
          fieldId
        },
        value: parsed.value
      }]
    })
  ))
}

export const planPaste = (options: {
  selection: GridSelection | null
  appearances: Pick<AppearanceList, 'indexOf' | 'ids' | 'at'>
  fields: FieldList
  matrix: readonly (readonly string[])[]
}): TablePasteEntry[] => {
  const anchorCell = options.selection?.anchor
  if (!anchorCell || !options.matrix.length) {
    return []
  }

  if (options.matrix.length === 1 && options.matrix[0]?.length === 1) {
    const currentRange = range.from(options.selection)
    if (currentRange && !range.isSingle(currentRange, options.appearances, options.fields)) {
      return planRangeBroadcast(
        options.selection,
        options.appearances,
        options.fields,
        options.matrix[0][0] ?? ''
      )
    }
  }

  const rowStart = grid.appearanceIndex(options.appearances, anchorCell.appearanceId)
  const fieldStart = grid.fieldIndex(options.fields, anchorCell.fieldId)
  if (rowStart === undefined || fieldStart === undefined) {
    return []
  }

  return options.matrix.flatMap((row, rowOffset) => {
    const appearanceId = grid.appearanceAt(options.appearances, rowStart + rowOffset)
    if (!appearanceId) {
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
          appearanceId,
          fieldId: field.id
        },
        value: parsed.value
      }]
    })
  })
}

export const paste = {
  parseClipboardMatrix,
  planPaste
} as const
