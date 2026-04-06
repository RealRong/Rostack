import type {
  ViewQuery as StoredGroupViewQuery
} from '@dataview/core/contracts'
import type { ViewQuery } from './contracts'
import { cloneGrouping } from './shared'

export const normalizeViewQuery = (
  query?: StoredGroupViewQuery
): ViewQuery => ({
  search: query
    ? {
        query: query.search.query,
        fields: query.search.fields?.length
          ? [...query.search.fields]
          : undefined
      }
    : {
        query: ''
      },
  filter: query
    ? {
        mode: query.filter.mode,
        rules: query.filter.rules.map(rule => ({
          field: rule.field,
          op: rule.op,
          value: structuredClone(rule.value)
        }))
      }
    : {
        mode: 'and',
        rules: []
      },
  sorters: query
    ? query.sorters.map(sorter => ({
        field: sorter.field,
        direction: sorter.direction
      }))
    : [],
  group: cloneGrouping(query?.group)
})
