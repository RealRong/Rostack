import type {
  FieldKind,
  FieldId,
  FilterRule,
  FilterValue,
  RecordId,
  Sort,
  View
} from '@dataview/core/types'
import { key } from '@shared/spec'

const queryExecutionKey = key.tuple([
  'search',
  'filters',
  'filterMode',
  'sort',
  'order'
] as const)

const pathKey = key.path()
const filterKey = key.tuple([
  'fieldId',
  'fieldKind',
  'presetId',
  'value'
] as const)
const sortKey = key.tuple([
  'fieldId',
  'direction'
] as const)

const encodeFilterValue = (
  value: FilterValue | undefined
): string | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    return pathKey.write(['string', value])
  }

  if (typeof value === 'number') {
    return pathKey.write(['number', String(value)])
  }

  if (typeof value === 'boolean') {
    return pathKey.write(['boolean', value ? 'true' : 'false'])
  }

  if (value.kind === 'option-set') {
    return pathKey.write(['option-set', ...value.optionIds])
  }

  return pathKey.write([
    value.kind,
    value.start,
    value.end,
    value.kind === 'datetime'
      ? value.timezone
      : undefined
  ])
}

const encodeSearch = (
  search: {
    query: string
    fieldIds: readonly FieldId[]
  } | undefined
): string | undefined => search
  ? pathKey.write([search.query, ...search.fieldIds])
  : undefined

const encodeFilters = (
  filters: readonly {
    fieldId: FieldId
    fieldKind: FieldKind | undefined
    rule: FilterRule
  }[]
): string | undefined => filters.length
  ? pathKey.write(filters.map(({
    fieldId,
    fieldKind,
    rule
  }) => filterKey.write({
    fieldId,
    fieldKind,
    presetId: rule.presetId,
    value: encodeFilterValue(rule.value)
  })))
  : undefined

const encodeSort = (
  sort: Sort
): string | undefined => {
  const entries = sort.rules.map((rule) => sortKey.write({
    fieldId: rule.fieldId,
    direction: rule.direction
  }))

  return entries.length
    ? pathKey.write(entries)
    : undefined
}

const encodeOrder = (
  order: readonly RecordId[]
): string | undefined => order.length
  ? pathKey.write(order)
  : undefined

export const writeQueryExecutionKey = (input: {
  search?: {
    query: string
    fieldIds: readonly FieldId[]
  }
  filters: readonly {
    fieldId: FieldId
    fieldKind: FieldKind | undefined
    rule: FilterRule
  }[]
  filterMode: View['filter']['mode']
  sort: Sort
  order: readonly RecordId[]
}): string => queryExecutionKey.write({
  search: encodeSearch(input.search),
  filters: encodeFilters(input.filters),
  filterMode: input.filters.length
    ? input.filterMode
    : undefined,
  sort: encodeSort(input.sort),
  order: encodeOrder(input.order)
})
