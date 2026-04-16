import type {
  SortDirection,
  Sorter
} from '@dataview/core/contracts'
import { defineMetaCollection } from '@dataview/meta/shared'
import {
  token,
  type Token
} from '@shared/i18n'

export interface SortDirectionDescriptor {
  id: SortDirection | string
  token: Token
}

const SORT_DIRECTION_ITEMS = [
  {
    id: 'asc',
    token: token('meta.sort.direction.asc', 'Ascending')
  },
  {
    id: 'desc',
    token: token('meta.sort.direction.desc', 'Descending')
  }
] as const satisfies readonly SortDirectionDescriptor[]

export const sort = {
  direction: defineMetaCollection(SORT_DIRECTION_ITEMS, {
    defaultId: 'asc',
    fallback: (id?: string) => ({
      id: id ?? 'asc',
      token: token('meta.sort.direction.unknown', id ?? 'Ascending')
    })
  }),
  summary: (sorters: readonly Sorter[]) => ({
    token: !sorters.length
      ? token('meta.sort.summary.empty', 'Sort')
      : sorters.length === 1
        ? token('meta.sort.summary.single', '1 sort')
        : token('meta.sort.summary.multiple', '{{count}} sorts', {
            count: sorters.length
          })
  })
} as const
