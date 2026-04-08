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
): ViewQuery => ({
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
          field: rule.field,
          op: rule.op,
          value: structuredClone(rule.value)
        }))
      }
    : {
        mode: 'and',
        rules: []
      },
  sort: (query?.sort ?? query?.sorters)
    ? (query.sort ?? query.sorters)!.map(sorter => ({
        field: sorter.field,
        direction: sorter.direction
      }))
    : [],
  group: cloneGrouping(query?.group)
})
