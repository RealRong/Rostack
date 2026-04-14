import type {
  Sorter
} from '@dataview/core/contracts'
import {
  getSorterFieldId
} from '@dataview/react/page/features/query/fields'

export const SORT_DIRECTIONS = [
  'asc',
  'desc'
] as const

export const getSorterItemId = (
  sorter: Pick<Sorter, 'field'>,
  index: number
) => getSorterFieldId(sorter) ?? `sorter_${index}`
