import type {
  DocumentViewQuery
} from '#core/contracts/index.ts'
import {
  normalizeGroup
} from '#core/group/index.ts'
import {
  normalizeSearch
} from '#core/search/index.ts'
import {
  normalizeSorters
} from '#core/sort/index.ts'

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
