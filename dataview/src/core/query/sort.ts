import type {
  SortDirection,
  Sorter
} from '@dataview/core/contracts'
import type { ViewQuery } from './contracts'
import { cloneSorter, cloneViewQuery } from './shared'

export const findViewSorterIndex = (
  query: ViewQuery,
  fieldId: string
) => query.sorters.findIndex(sorter => (
  typeof sorter.field === 'string' && sorter.field === fieldId
))

export const addViewSorter = (
  query: ViewQuery,
  fieldId: string,
  direction: SortDirection = 'asc'
) => {
  if (findViewSorterIndex(query, fieldId) !== -1) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters.push({
    field: fieldId,
    direction
  })
  return next
}

export const setViewSorter = (
  query: ViewQuery,
  fieldId: string,
  direction: SortDirection
): ViewQuery => {
  const next = cloneViewQuery(query)
  const existingIndex = findViewSorterIndex(next, fieldId)

  if (existingIndex === -1) {
    next.sorters.push({
      field: fieldId,
      direction
    })
    return next
  }

  next.sorters[existingIndex] = {
    field: fieldId,
    direction
  }
  return next
}

export const setOnlyViewSorter = (
  query: ViewQuery,
  fieldId: string,
  direction: SortDirection
): ViewQuery => {
  if (
    query.sorters.length === 1
    && query.sorters[0]?.field === fieldId
    && query.sorters[0]?.direction === direction
  ) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters = [{
    field: fieldId,
    direction
  }]
  return next
}

export const replaceViewSorter = (
  query: ViewQuery,
  index: number,
  sorter: Sorter
): ViewQuery => {
  if (!query.sorters[index]) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters[index] = cloneSorter(sorter)
  return next
}

export const removeViewSorter = (
  query: ViewQuery,
  index: number
): ViewQuery => {
  if (index < 0 || index >= query.sorters.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters.splice(index, 1)
  return next
}

export const moveViewSorter = (
  query: ViewQuery,
  from: number,
  to: number
): ViewQuery => {
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
  query: ViewQuery
): ViewQuery => {
  if (!query.sorters.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sorters = []
  return next
}
