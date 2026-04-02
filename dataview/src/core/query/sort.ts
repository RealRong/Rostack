import type {
  GroupSortDirection,
  GroupSorter
} from '@dataview/core/contracts'
import type { GroupViewQuery } from './contracts'
import { cloneSorter, cloneViewQuery } from './shared'

export const findViewSorterIndex = (
  query: GroupViewQuery,
  propertyId: string
) => query.sorters.findIndex(sorter => (
  typeof sorter.property === 'string' && sorter.property === propertyId
))

export const addViewSorter = (
  query: GroupViewQuery,
  propertyId: string,
  direction: GroupSortDirection = 'asc'
) => {
  if (findViewSorterIndex(query, propertyId) !== -1) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters.push({
    property: propertyId,
    direction
  })
  return next
}

export const setViewSorter = (
  query: GroupViewQuery,
  propertyId: string,
  direction: GroupSortDirection
): GroupViewQuery => {
  const next = cloneViewQuery(query)
  const existingIndex = findViewSorterIndex(next, propertyId)

  if (existingIndex === -1) {
    next.sorters.push({
      property: propertyId,
      direction
    })
    return next
  }

  next.sorters[existingIndex] = {
    property: propertyId,
    direction
  }
  return next
}

export const setOnlyViewSorter = (
  query: GroupViewQuery,
  propertyId: string,
  direction: GroupSortDirection
): GroupViewQuery => {
  if (
    query.sorters.length === 1
    && query.sorters[0]?.property === propertyId
    && query.sorters[0]?.direction === direction
  ) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters = [{
    property: propertyId,
    direction
  }]
  return next
}

export const replaceViewSorter = (
  query: GroupViewQuery,
  index: number,
  sorter: GroupSorter
): GroupViewQuery => {
  if (!query.sorters[index]) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters[index] = cloneSorter(sorter)
  return next
}

export const removeViewSorter = (
  query: GroupViewQuery,
  index: number
): GroupViewQuery => {
  if (index < 0 || index >= query.sorters.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters.splice(index, 1)
  return next
}

export const moveViewSorter = (
  query: GroupViewQuery,
  from: number,
  to: number
): GroupViewQuery => {
  if (
    from < 0
    || from >= query.sorters.length
    || to < 0
    || to >= query.sorters.length
    || from === to
  ) {
    return query
  }

  const next = cloneViewQuery(query)
  const [sorter] = next.sorters.splice(from, 1)
  if (!sorter) {
    return query
  }

  next.sorters.splice(to, 0, sorter)
  return next
}

export const clearViewSorters = (
  query: GroupViewQuery
): GroupViewQuery => {
  if (!query.sorters.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters = []
  return next
}
