import type { GroupProperty } from '@/core/contracts'
import { parsePropertyDraft } from '@/core/property'
import type {
  AppearanceList,
  FieldId,
  PropertyList
} from '@/engine/projection/view'
import {
  grid
} from './grid'
import {
  type GridSelection
} from './gridSelection'
import { range } from './range'

export interface TablePasteEntry {
  cell: FieldId
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
  property: GroupProperty,
  draft: string
): { ok: boolean; value?: unknown } => {
  const parsed = parsePropertyDraft(property, draft)
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
  properties: PropertyList,
  draft: string
): TablePasteEntry[] => {
  const currentRange = range.from(currentSelection)
  if (!currentRange) {
    return []
  }

  const appearanceIds = range.appearances(currentRange, appearances)
  const propertyIds = range.properties(currentRange, properties)
  if (!appearanceIds.length || !propertyIds.length) {
    return []
  }

  const propertyMap = new Map(properties.all.map(property => [property.id, property] as const))

  return appearanceIds.flatMap(appearanceId => (
    propertyIds.flatMap(propertyId => {
      const property = propertyMap.get(propertyId)
      if (!property) {
        return []
      }

      const parsed = parseCellDraft(property, draft)
      if (!parsed.ok) {
        return []
      }

      return [{
        cell: {
          appearanceId,
          propertyId
        },
        value: parsed.value
      }]
    })
  ))
}

export const planPaste = (options: {
  selection: GridSelection | null
  appearances: Pick<AppearanceList, 'indexOf' | 'ids' | 'at'>
  properties: PropertyList
  matrix: readonly (readonly string[])[]
}): TablePasteEntry[] => {
  const anchorCell = options.selection?.anchor
  if (!anchorCell || !options.matrix.length) {
    return []
  }

  if (options.matrix.length === 1 && options.matrix[0]?.length === 1) {
    const currentRange = range.from(options.selection)
    if (currentRange && !range.isSingle(currentRange, options.appearances, options.properties)) {
      return planRangeBroadcast(
        options.selection,
        options.appearances,
        options.properties,
        options.matrix[0][0] ?? ''
      )
    }
  }

  const rowStart = grid.appearanceIndex(options.appearances, anchorCell.appearanceId)
  const propertyStart = grid.propertyIndex(options.properties, anchorCell.propertyId)
  if (rowStart === undefined || propertyStart === undefined) {
    return []
  }

  return options.matrix.flatMap((row, rowOffset) => {
    const appearanceId = grid.appearanceAt(options.appearances, rowStart + rowOffset)
    if (!appearanceId) {
      return []
    }

    return row.flatMap((draft, columnOffset) => {
      const property = options.properties.all[propertyStart + columnOffset]
      if (!property) {
        return []
      }

      const parsed = parseCellDraft(property, draft)
      if (!parsed.ok) {
        return []
      }

      return [{
        cell: {
          appearanceId,
          propertyId: property.id
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
