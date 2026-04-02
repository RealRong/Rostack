import type {
  GroupSortDirection,
  GroupSorter
} from '@dataview/core/contracts'
import { message } from './message'
import { defineMetaCollection } from './shared'

export interface SortDirectionDescriptor {
  id: GroupSortDirection | string
  message: ReturnType<typeof message>
}

const SORT_DIRECTION_ITEMS = [
  {
    id: 'asc',
    message: message('meta.sort.direction.asc', 'Ascending')
  },
  {
    id: 'desc',
    message: message('meta.sort.direction.desc', 'Descending')
  }
] as const satisfies readonly SortDirectionDescriptor[]

export const sort = {
  direction: defineMetaCollection(SORT_DIRECTION_ITEMS, {
    defaultId: 'asc',
    fallback: (id?: string) => ({
      id: id ?? 'asc',
      message: message('meta.sort.direction.unknown', id ?? 'Ascending')
    })
  }),
  summary: (sorters: readonly GroupSorter[]) => ({
    message: !sorters.length
      ? message('meta.sort.summary.empty', 'Sort')
      : sorters.length === 1
        ? message('meta.sort.summary.single', '1 sort')
        : message('meta.sort.summary.multiple', '{count} sorts', {
            count: sorters.length
          })
  })
} as const
