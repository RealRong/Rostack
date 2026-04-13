import type {
  DocumentViewQuery
} from '#core/contracts'
import {
  normalizeGroup
} from '#core/group'
import {
  normalizeSearch
} from '#core/search'
import {
  normalizeSorters
} from '#core/sort'

export const normalizeViewQuery = (
  query?: Partial<Pick<DocumentViewQuery, 'search' | 'filter' | 'group' | 'sort'>>
): DocumentViewQuery => {
  return {
    search: normalizeSearch(query?.search),
    filter: query?.filter
      ? {
          mode: query.filter.mode,
          rules: query.filter.rules.map(rule => ({
            fieldId: rule.fieldId,
            presetId: rule.presetId,
            ...(Object.prototype.hasOwnProperty.call(rule, 'value')
              ? { value: structuredClone(rule.value) }
              : {})
          }))
        }
      : {
          mode: 'and',
          rules: []
        },
    sort: normalizeSorters(query?.sort),
    group: normalizeGroup(query?.group)
  }
}
