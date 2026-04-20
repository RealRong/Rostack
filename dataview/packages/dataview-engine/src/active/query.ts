import type {
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import {
  isFilterRuleEffective
} from '@dataview/core/filter'
import {
  resolveDefaultSearchFieldIds
} from '@dataview/engine/active/index/demand'
import type {
  DocumentReader
} from '@dataview/engine/document/reader'
import {
  trimLowercase,
  uniqueSorted
} from '@shared/core'

export interface EffectiveFilterRule {
  fieldId: FieldId
  field: Field | undefined
  rule: View['filter']['rules'][number]
}

export interface ActiveQueryPlan {
  search?: {
    query: string
    fieldIds: readonly FieldId[]
  }
  filters: readonly EffectiveFilterRule[]
  demand: {
    searchFieldIds: readonly FieldId[]
    groupFieldIds: readonly FieldId[]
    sortFieldIds: readonly FieldId[]
  }
  watch: {
    search: readonly FieldId[] | 'all'
    filter: readonly FieldId[]
    sort: readonly FieldId[]
  }
  executionKey: string
}

const isKnownFieldId = (
  reader: DocumentReader,
  fieldId: FieldId
): boolean => fieldId === 'title' || reader.fields.has(fieldId)

const resolveSearchFieldIds = (
  reader: DocumentReader,
  view: View
): readonly FieldId[] => (
  view.search.fields?.length
    ? uniqueSorted(view.search.fields.filter(fieldId => isKnownFieldId(reader, fieldId)))
    : resolveDefaultSearchFieldIds({
      document: reader.document(),
      reader
    })
)

const resolveEffectiveFilterRules = (
  reader: DocumentReader,
  view: View
): readonly EffectiveFilterRule[] => {
  const rules: EffectiveFilterRule[] = []

  for (let index = 0; index < view.filter.rules.length; index += 1) {
    const rule = view.filter.rules[index]!
    const field = reader.fields.get(rule.fieldId)
    if (!isFilterRuleEffective(field, rule)) {
      continue
    }

    rules.push({
      fieldId: rule.fieldId,
      field,
      rule
    })
  }

  return rules
}

const createExecutionKey = (input: {
  search?: ActiveQueryPlan['search']
  filters: readonly EffectiveFilterRule[]
  filterMode: View['filter']['mode']
  sort: View['sort']
  orders: View['orders']
}): string => JSON.stringify({
  search: input.search
    ? {
        query: input.search.query,
        fieldIds: input.search.fieldIds
      }
    : undefined,
  filters: input.filters.map(({ fieldId, field, rule }) => ({
    fieldId,
    fieldKind: field?.kind,
    rule
  })),
  filterMode: input.filters.length
    ? input.filterMode
    : undefined,
  sort: input.sort,
  orders: input.orders
})

export const compileViewQuery = (
  reader: DocumentReader,
  view: View
): ActiveQueryPlan => {
  const searchFieldIds = resolveSearchFieldIds(reader, view)
  const searchQuery = trimLowercase(view.search.query)
  const filters = resolveEffectiveFilterRules(reader, view)
  const groupFieldIds = new Set<FieldId>()
  const sortFieldIds = new Set<FieldId>()

  for (let index = 0; index < filters.length; index += 1) {
    const rule = filters[index]!
    switch (rule.field?.kind) {
      case 'status':
      case 'select':
      case 'multiSelect':
      case 'boolean':
        groupFieldIds.add(rule.fieldId)
        break
      case 'number':
      case 'date':
        sortFieldIds.add(rule.fieldId)
        break
      default:
        break
    }
  }

  const search = searchQuery
    ? {
        query: searchQuery,
        fieldIds: searchFieldIds
      }
    : undefined

  return {
    ...(search
      ? { search }
      : {}),
    filters,
    demand: {
      searchFieldIds,
      groupFieldIds: uniqueSorted([...groupFieldIds]),
      sortFieldIds: uniqueSorted([...sortFieldIds])
    },
    watch: {
      search: search
        ? (view.search.fields?.length ? search.fieldIds : 'all')
        : [],
      filter: uniqueSorted(filters.map(rule => rule.fieldId)),
      sort: uniqueSorted(view.sort.map(sorter => sorter.field))
    },
    executionKey: createExecutionKey({
      search,
      filters,
      filterMode: view.filter.mode,
      sort: view.sort,
      orders: view.orders
    })
  }
}
