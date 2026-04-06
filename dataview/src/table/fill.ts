import type {
  AppearanceList,
  CellRef,
  FieldList
} from '@dataview/engine/projection/view'
import {
  range
} from './range'
import {
  type GridSelection
} from './gridSelection'

export interface TableFillEntry {
  cell: CellRef
  value: unknown | undefined
}

const handleCell = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  fields: Pick<FieldList, 'indexOf' | 'ids'>
): CellRef | undefined => {
  if (!current) {
    return undefined
  }

  const currentRange = range.from(current)
  const rowIds = currentRange ? range.appearances(currentRange, appearances) : []
  const fieldIds = currentRange ? range.fields(currentRange, fields) : []

  if (rowIds.length !== 1 || !fieldIds.length) {
    return undefined
  }

  return current.focus
}

const can = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  fields: Pick<FieldList, 'indexOf' | 'ids'>
) => Boolean(handleCell(current, appearances, fields))

const plan = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  fields: Pick<FieldList, 'indexOf' | 'ids'>,
  read: (cell: CellRef) => {
    exists: boolean
    value: unknown
  }
): TableFillEntry[] => {
  if (!current) {
    return []
  }

  const currentRange = range.from(current)
  if (!currentRange) {
    return []
  }

  const fieldIds = range.fields(currentRange, fields)
  const targetAppearanceIds = range.appearances(currentRange, appearances)
    .filter(appearanceId => appearanceId !== current.anchor.appearanceId)

  if (!fieldIds.length || !targetAppearanceIds.length) {
    return []
  }

  return targetAppearanceIds.flatMap(appearanceId => (
    fieldIds.map(fieldId => ({
      cell: {
        appearanceId,
        fieldId
      },
      value: read({
        appearanceId: current.anchor.appearanceId,
        fieldId
      }).value
    }))
  ))
}

export const fill = {
  can,
  handleCell,
  plan
} as const
