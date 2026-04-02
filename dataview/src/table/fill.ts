import type {
  AppearanceList,
  FieldId,
  PropertyList
} from '@dataview/engine/projection/view'
import {
  range
} from './range'
import {
  type GridSelection
} from './gridSelection'

export interface TableFillEntry {
  cell: FieldId
  value: unknown | undefined
}

const handleCell = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  properties: Pick<PropertyList, 'indexOf' | 'ids'>
): FieldId | undefined => {
  if (!current) {
    return undefined
  }

  const currentRange = range.from(current)
  const rowIds = currentRange ? range.appearances(currentRange, appearances) : []
  const propertyIds = currentRange ? range.properties(currentRange, properties) : []

  if (rowIds.length !== 1 || !propertyIds.length) {
    return undefined
  }

  return current.focus
}

const can = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  properties: Pick<PropertyList, 'indexOf' | 'ids'>
) => Boolean(handleCell(current, appearances, properties))

const plan = (
  current: GridSelection | null,
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  properties: Pick<PropertyList, 'indexOf' | 'ids'>,
  read: (cell: FieldId) => {
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

  const propertyIds = range.properties(currentRange, properties)
  const targetAppearanceIds = range.appearances(currentRange, appearances)
    .filter(appearanceId => appearanceId !== current.anchor.appearanceId)

  if (!propertyIds.length || !targetAppearanceIds.length) {
    return []
  }

  return targetAppearanceIds.flatMap(appearanceId => (
    propertyIds.map(propertyId => ({
      cell: {
        appearanceId,
        propertyId
      },
      value: read({
        appearanceId: current.anchor.appearanceId,
        propertyId
      }).value
    }))
  ))
}

export const fill = {
  can,
  handleCell,
  plan
} as const
