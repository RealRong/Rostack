import type { GroupViewQuery } from './contracts'
import { cloneViewQuery } from './shared'

export const setViewSearchQuery = (
  query: GroupViewQuery,
  value: string
): GroupViewQuery => {
  if (query.search.query === value) {
    return query
  }

  return {
    ...cloneViewQuery(query),
    search: {
      query: value,
      properties: query.search.properties?.length
        ? [...query.search.properties]
        : undefined
    }
  }
}
