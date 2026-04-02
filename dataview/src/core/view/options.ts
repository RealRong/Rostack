import type {
  PropertyId,
  GroupProperty,
  GroupTableOptions,
  GroupViewOptions,
  GroupViewDisplayOptions,
  GroupViewType
} from '../contracts'
import { TITLE_PROPERTY_ID } from '../property'
import { cloneGroupViewOptions } from './shared'

export const cloneGroupViewDisplayOptions = (
  display: GroupViewDisplayOptions
): GroupViewDisplayOptions => ({
  propertyIds: [...display.propertyIds]
})

export const cloneGroupTableOptions = (
  table: GroupTableOptions
): GroupTableOptions => ({
  widths: {
    ...table.widths
  }
})

export const resolveGroupTitleProperty = <T extends Pick<GroupProperty, 'id'>>(
  properties: readonly T[]
): T | undefined => properties.find(property => property.id === TITLE_PROPERTY_ID)

export const resolveGroupTitlePropertyId = (
  properties: readonly Pick<GroupProperty, 'id'>[]
) => (
  properties.some(property => property.id === TITLE_PROPERTY_ID)
    ? TITLE_PROPERTY_ID
    : undefined
)

export const createDefaultGroupViewDisplayOptions = (
  type: GroupViewType,
  properties: readonly GroupProperty[]
): GroupViewDisplayOptions => ({
  propertyIds: !properties.length
    ? []
    : type === 'table'
      ? properties.map(property => property.id)
      : (() => {
          const titlePropertyId = resolveGroupTitlePropertyId(properties)
          return titlePropertyId ? [titlePropertyId] : []
        })()
})

export const createDefaultGroupViewOptions = (
  type: GroupViewType,
  properties: readonly GroupProperty[]
): GroupViewOptions => ({
  display: createDefaultGroupViewDisplayOptions(type, properties),
  table: {
    widths: {}
  },
  gallery: {
    showPropertyLabels: true,
    cardSize: 'md'
  },
  kanban: {
    newRecordPosition: 'end'
  }
})

export const prunePropertyFromViewOptions = (
  options: GroupViewOptions,
  propertyId: PropertyId
): GroupViewOptions => {
  const current = cloneGroupViewOptions(options)
  const hasDisplay = current.display.propertyIds.some(id => id === propertyId)
  const hasWidth = Object.prototype.hasOwnProperty.call(current.table.widths, propertyId)

  if (!hasDisplay && !hasWidth) {
    return options
  }

  if (hasDisplay) {
    current.display = {
      propertyIds: current.display.propertyIds.filter(id => id !== propertyId)
    }
  }

  if (hasWidth) {
    const widths = {
      ...current.table.widths
    }
    delete widths[propertyId]
    current.table = { widths }
  }

  return current
}
