import type {
  Search
} from '@dataview/core/contracts'
import {
  sameOptionalOrder
} from '@shared/equality'

const normalizeFieldIds = (
  value: unknown
): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
)

export const cloneSearch = (
  search: Search
): Search => ({
  query: search.query,
  ...(search.fields?.length
    ? { fields: [...search.fields] }
    : {})
})

export const normalizeSearch = (
  search: unknown
): Search => {
  const source = typeof search === 'object' && search !== null
    ? search as {
        query?: unknown
        fields?: unknown
      }
    : undefined

  return {
    query: typeof source?.query === 'string'
      ? source.query
      : '',
    ...(Array.isArray(source?.fields)
      ? { fields: normalizeFieldIds(source.fields) }
      : {})
  }
}

export const sameSearch = (
  left: Search,
  right: Search
) => (
  left.query === right.query
  && sameFieldIds(left.fields, right.fields)
)

export const setSearchQuery = (
  search: Search,
  value: string
): Search => {
  if (search.query === value) {
    return search
  }

  return {
    ...cloneSearch(search),
    query: value
  }
}

const sameFieldIds = (
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
) => sameOptionalOrder(
  left?.length ? left : undefined,
  right?.length ? right : undefined
)
