import type {
  ViewQuery as StoredGroupViewQuery
} from '@dataview/core/contracts/state'
import type { ViewQuery } from './contracts'
import { cloneGrouping } from './shared'

export const normalizeViewQuery = (
  query?: Partial<Pick<StoredGroupViewQuery, 'search' | 'filter' | 'group'> & {
    sort: StoredGroupViewQuery['sorters']
    sorters: StoredGroupViewQuery['sorters']
  }>
): ViewQuery => {
  const sorters = query?.sort ?? query?.sorters

  return {
    search: query?.search
      ? {
          query: query.search.query,
          fields: query.search.fields?.length
            ? [...query.search.fields]
            : undefined
        }
      : {
          query: ''
        },
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
    sort: sorters
      ? sorters.map(sorter => ({
          field: sorter.field,
          direction: sorter.direction
        }))
      : [],
    group: cloneGrouping(query?.group)
  }
}
