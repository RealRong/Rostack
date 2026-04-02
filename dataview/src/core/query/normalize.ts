import type {
  GroupViewQuery as StoredGroupViewQuery
} from '@dataview/core/contracts'
import type { GroupViewQuery } from './contracts'
import { cloneGroup } from './shared'

export const normalizeGroupViewQuery = (
  query?: StoredGroupViewQuery
): GroupViewQuery => ({
  search: query
    ? {
        query: query.search.query,
        properties: query.search.properties?.length
          ? [...query.search.properties]
          : undefined
      }
    : {
        query: ''
      },
  filter: query
    ? {
        mode: query.filter.mode,
        rules: query.filter.rules.map(rule => ({
          property: rule.property,
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
        property: sorter.property,
        direction: sorter.direction
      }))
    : [],
  group: cloneGroup(query?.group)
})
