import type {
  SortDirection,
  Sorter
} from '@dataview/core/contracts'
import type { ViewQuery } from './contracts'
import { cloneSorter, cloneViewQuery } from './shared'

export const findViewSorterIndex = (
  query: ViewQuery,
  fieldId: string
) => query.sort.findIndex(sorter => (
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
  next.sort.push({
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
    next.sort.push({
      field: fieldId,
      direction
    })
    return next
  }

  next.sort[existingIndex] = {
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
    query.sort.length === 1
    && query.sort[0]?.field === fieldId
    && query.sort[0]?.direction === direction
  ) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sort = [{
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
  if (!query.sort[index]) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sort[index] = cloneSorter(sorter)
  return next
}

export const removeViewSorter = (
  query: ViewQuery,
  index: number
): ViewQuery => {
  if (index < 0 || index >= query.sort.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sort.splice(index, 1)
  return next
}

export const moveViewSorter = (
  query: ViewQuery,
  from: number,
  to: number
): ViewQuery => {
  if (
    from < 0
    || from >= query.sort.length
    || to < 0
    || to >= query.sort.length
    || from === to
  ) {
    return query
  }

  const next = cloneViewQuery(query)
  const [sorter] = next.sort.splice(from, 1)
  if (!sorter) {
    return query
  }

  next.sort.splice(to, 0, sorter)
  return next
}

export const clearViewSorters = (
  query: ViewQuery
): ViewQuery => {
  if (!query.sort.length) {
    return query
  }

  const next = cloneViewQuery(query)
  next.sort = []
  return next
}
