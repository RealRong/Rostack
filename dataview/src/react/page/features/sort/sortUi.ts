import type {
  PropertyId,
  GroupProperty,
  GroupSorter
} from '@/core/contracts'

export const SORT_DIRECTIONS = [
  'asc',
  'desc'
] as const

export const getSorterPropertyId = (
  sorter: Pick<GroupSorter, 'property'>
): PropertyId | undefined => {
  if (typeof sorter.property !== 'string') {
    return undefined
  }

  return sorter.property
}

export const getSorterItemId = (
  sorter: Pick<GroupSorter, 'property'>,
  index: number
) => getSorterPropertyId(sorter) ?? `sorter_${index}`

export const findSorterProperty = (
  properties: readonly GroupProperty[],
  sorter: Pick<GroupSorter, 'property'>
) => {
  const propertyId = getSorterPropertyId(sorter)
  return propertyId
    ? properties.find(property => property.id === propertyId)
    : undefined
}

export const getAvailableSorterProperties = (
  properties: readonly GroupProperty[],
  sorters: readonly GroupSorter[]
) => {
  const usedPropertyIds = new Set<PropertyId>()

  sorters.forEach(sorter => {
    const propertyId = getSorterPropertyId(sorter)
    if (propertyId) {
      usedPropertyIds.add(propertyId)
    }
  })

  return properties.filter(property => !usedPropertyIds.has(property.id))
}

export const getAvailableSorterPropertiesForIndex = (
  properties: readonly GroupProperty[],
  sorters: readonly GroupSorter[],
  index: number
) => {
  const currentPropertyId = getSorterPropertyId(sorters[index] ?? { property: undefined })
  const usedPropertyIds = new Set<PropertyId>()

  sorters.forEach((sorter, sorterIndex) => {
    if (sorterIndex === index) {
      return
    }

    const propertyId = getSorterPropertyId(sorter)
    if (propertyId) {
      usedPropertyIds.add(propertyId)
    }
  })

  return properties.filter(property => property.id === currentPropertyId || !usedPropertyIds.has(property.id))
}
