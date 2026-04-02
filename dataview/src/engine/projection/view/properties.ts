import type {
  GroupProperty,
  PropertyId
} from '@/core/contracts'
import type {
  PropertyList
} from './types'

const emptyIds = [] as readonly PropertyId[]

export const createProperties = (input: {
  propertyIds: readonly PropertyId[]
  byId: ReadonlyMap<PropertyId, GroupProperty>
}): PropertyList => {
  const all = input.propertyIds.flatMap(propertyId => {
    const property = input.byId.get(propertyId)
    return property
      ? [property]
      : []
  })
  const ids = all.map(property => property.id)
  const indexById = new Map(ids.map((id, index) => [id, index] as const))
  const visibleById = new Map(all.map(property => [property.id, property] as const))

  return {
    ids,
    all,
    get: id => visibleById.get(id),
    has: id => indexById.has(id),
    indexOf: id => indexById.get(id),
    at: index => ids[index],
    range: (anchor, focus) => {
      const anchorIndex = indexById.get(anchor)
      const focusIndex = indexById.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return emptyIds
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    }
  }
}
