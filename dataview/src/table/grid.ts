import type { PropertyId } from '@dataview/core/contracts'
import type {
  AppearanceId,
  AppearanceList,
  FieldId,
  PropertyList
} from '@dataview/engine/projection/view'

const emptyAppearanceIds = [] as readonly AppearanceId[]
const emptyPropertyIds = [] as readonly PropertyId[]

const clampIndex = (value: number, max: number) => {
  if (max <= 0) {
    return 0
  }

  return Math.max(0, Math.min(value, max - 1))
}

const hasAppearance = (
  appearances: Pick<AppearanceList, 'has'>,
  appearanceId: AppearanceId
) => appearances.has(appearanceId)

const hasProperty = (
  properties: Pick<PropertyList, 'has'>,
  propertyId: PropertyId
) => properties.has(propertyId)

const containsCell = (
  appearances: Pick<AppearanceList, 'has'>,
  properties: Pick<PropertyList, 'has'>,
  cell: FieldId
) => hasAppearance(appearances, cell.appearanceId) && hasProperty(properties, cell.propertyId)

const appearanceIndex = (
  appearances: Pick<AppearanceList, 'indexOf'>,
  appearanceId: AppearanceId
) => appearances.indexOf(appearanceId)

const propertyIndex = (
  properties: Pick<PropertyList, 'indexOf'>,
  propertyId: PropertyId
) => properties.indexOf(propertyId)

const appearanceAt = (
  appearances: Pick<AppearanceList, 'at'>,
  index: number
) => appearances.at(index)

const propertyAt = (
  properties: Pick<PropertyList, 'at'>,
  index: number
) => properties.at(index)

const normalizeAppearanceIds = (
  appearances: Pick<AppearanceList, 'ids'>,
  ids: readonly AppearanceId[]
) => {
  const idSet = new Set(ids)
  return appearances.ids.filter(id => idSet.has(id))
}

const appearancesBetween = (
  appearances: Pick<AppearanceList, 'indexOf' | 'ids'>,
  startId: AppearanceId,
  endId: AppearanceId
) => {
  const start = appearances.indexOf(startId)
  const end = appearances.indexOf(endId)
  if (start === undefined || end === undefined) {
    return emptyAppearanceIds
  }

  return appearances.ids.slice(Math.min(start, end), Math.max(start, end) + 1)
}

const propertiesBetween = (
  properties: Pick<PropertyList, 'indexOf' | 'ids'>,
  startId: PropertyId,
  endId: PropertyId
) => {
  const start = properties.indexOf(startId)
  const end = properties.indexOf(endId)
  if (start === undefined || end === undefined) {
    return emptyPropertyIds
  }

  return properties.ids.slice(Math.min(start, end), Math.max(start, end) + 1)
}

const cellAt = (
  appearances: Pick<AppearanceList, 'at'>,
  properties: Pick<PropertyList, 'at'>,
  nextAppearanceIndex: number,
  nextPropertyIndex: number
): FieldId | undefined => {
  const appearanceId = appearanceAt(appearances, nextAppearanceIndex)
  const propertyId = propertyAt(properties, nextPropertyIndex)
  return appearanceId && propertyId
    ? {
        appearanceId,
        propertyId
      }
    : undefined
}

const edgeCell = (
  appearances: Pick<AppearanceList, 'indexOf' | 'ids' | 'at'>,
  properties: Pick<PropertyList, 'ids' | 'at'>,
  appearanceId: AppearanceId,
  side: 'start' | 'end'
): FieldId | undefined => {
  const nextAppearanceIndex = appearanceIndex(appearances, appearanceId)
  if (nextAppearanceIndex === undefined || !properties.ids.length) {
    return undefined
  }

  return cellAt(
    appearances,
    properties,
    nextAppearanceIndex,
    side === 'start' ? 0 : properties.ids.length - 1
  )
}

const firstCell = (
  appearances: Pick<AppearanceList, 'ids' | 'has' | 'indexOf' | 'at'>,
  properties: Pick<PropertyList, 'ids' | 'at'>,
  appearanceId?: AppearanceId
): FieldId | undefined => {
  const nextAppearanceId = appearanceId && hasAppearance(appearances, appearanceId)
    ? appearanceId
    : appearanceAt(appearances, 0)
  return nextAppearanceId
    ? edgeCell(appearances, properties, nextAppearanceId, 'start')
    : undefined
}

const stepField = (
  appearances: Pick<AppearanceList, 'ids' | 'indexOf' | 'at'>,
  properties: Pick<PropertyList, 'ids' | 'indexOf' | 'at'>,
  cell: FieldId,
  options: {
    rowDelta: number
    columnDelta: number
    wrap?: boolean
  }
): FieldId | undefined => {
  const currentAppearanceIndex = appearanceIndex(appearances, cell.appearanceId)
  const currentPropertyIndex = propertyIndex(properties, cell.propertyId)
  if (
    currentAppearanceIndex === undefined
    || currentPropertyIndex === undefined
    || !appearances.ids.length
    || !properties.ids.length
  ) {
    return undefined
  }

  let nextAppearanceIndex = clampIndex(currentAppearanceIndex + options.rowDelta, appearances.ids.length)
  let nextPropertyIndex = clampIndex(currentPropertyIndex + options.columnDelta, properties.ids.length)

  if (options.wrap && options.rowDelta === 0) {
    const rawPropertyIndex = currentPropertyIndex + options.columnDelta
    if (rawPropertyIndex < 0) {
      nextAppearanceIndex = clampIndex(currentAppearanceIndex - 1, appearances.ids.length)
      nextPropertyIndex = nextAppearanceIndex === currentAppearanceIndex
        ? 0
        : properties.ids.length - 1
    } else if (rawPropertyIndex >= properties.ids.length) {
      nextAppearanceIndex = clampIndex(currentAppearanceIndex + 1, appearances.ids.length)
      nextPropertyIndex = nextAppearanceIndex === currentAppearanceIndex
        ? properties.ids.length - 1
        : 0
    } else {
      nextPropertyIndex = rawPropertyIndex
    }
  }

  return cellAt(
    appearances,
    properties,
    nextAppearanceIndex,
    nextPropertyIndex
  )
}

export const grid = {
  clampIndex,
  hasAppearance,
  hasProperty,
  containsCell,
  appearanceIndex,
  propertyIndex,
  appearanceAt,
  propertyAt,
  normalizeAppearanceIds,
  appearancesBetween,
  propertiesBetween,
  cellAt,
  edgeCell,
  firstCell,
  stepField
} as const
