import type { ViewQuery } from './contracts'
import { cloneViewQuery } from './shared'

export const setViewSearchQuery = (
  query: ViewQuery,
  value: string
): ViewQuery => {
  if (query.search.query === value) {
    return query
  }

  return {
    ...cloneViewQuery(query),
    search: {
      query: value,
      fields: query.search.fields?.length
        ? [...query.search.fields]
        : undefined
    }
  }
}
