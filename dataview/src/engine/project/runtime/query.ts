import type {
  DataDoc,
  Field,
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  compareFieldValues
} from '@dataview/core/field'
import {
  isFilterRuleEffective,
  matchFilterRule
} from '@dataview/core/filter'
import {
  applyRecordOrder,
  normalizeRecordOrderIds
} from '@dataview/core/view/order'
import type {
  IndexState,
  SearchIndex
} from '../../index/types'
import type {
  QueryState
} from './state'

const sameIds = (
  left: readonly RecordId[],
  right: readonly RecordId[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const createOrderIndex = (
  ids: readonly RecordId[]
): ReadonlyMap<RecordId, number> => new Map(
  ids.map((id, index) => [id, index] as const)
)

const sortRecordIds = (input: {
  ids: readonly RecordId[]
  document: DataDoc
  index: IndexState
  view: View
}): readonly RecordId[] => {
  if (!input.view.sort.length) {
    return [...input.ids]
  }

  const recordOrderIndex = createOrderIndex(input.index.records.ids)

  return [...input.ids].sort((leftId, rightId) => {
    for (const sorter of input.view.sort) {
      const field = getDocumentFieldById(input.document, sorter.field)
      const values = input.index.sort.fields.get(sorter.field)
      const result = compareFieldValues(
        field,
        values?.get(leftId),
        values?.get(rightId)
      )

      if (result !== 0) {
        return sorter.direction === 'asc'
          ? result
          : -result
      }
    }

    return (recordOrderIndex.get(leftId) ?? Number.MAX_SAFE_INTEGER)
      - (recordOrderIndex.get(rightId) ?? Number.MAX_SAFE_INTEGER)
  })
}

const applyViewOrders = (
  ids: readonly RecordId[],
  view: View
) => {
  if (view.sort.length > 0) {
    return [...ids]
  }

  const normalizedOrders = normalizeRecordOrderIds(
    view.orders,
    new Set(ids)
  )
  return normalizedOrders.length
    ? applyRecordOrder(ids, normalizedOrders)
    : [...ids]
}

const addMatchedPostings = (
  target: Set<RecordId>,
  postings: ReadonlyMap<string, ReadonlySet<RecordId>>,
  query: string
) => {
  postings.forEach((ids, token) => {
    if (!token.includes(query)) {
      return
    }

    ids.forEach(id => target.add(id))
  })
}

const resolveSearchMatches = (input: {
  search: View['search']
  index: SearchIndex
}): ReadonlySet<RecordId> | undefined => {
  const query = input.search.query.trim().toLowerCase()
  if (!query) {
    return undefined
  }

  const matches = new Set<RecordId>()
  if (input.search.fields?.length) {
    input.search.fields.forEach(fieldId => {
      const postings = input.index.fields.get(fieldId)
      if (!postings) {
        return
      }

      addMatchedPostings(matches, postings, query)
    })
  } else if (input.index.all) {
    addMatchedPostings(matches, input.index.all, query)
  }

  return matches
}

const resolveEffectiveFilterRules = (
  document: DataDoc,
  view: View
): readonly {
  fieldId: string
  field: Field | undefined
  rule: View['filter']['rules'][number]
}[] => view.filter.rules.flatMap(rule => {
  const field = getDocumentFieldById(document, rule.fieldId)
  return isFilterRuleEffective(field, rule)
    ? [{
        fieldId: rule.fieldId,
        field,
        rule
      }]
    : []
})

const matchesFilter = (input: {
  recordId: RecordId
  mode: View['filter']['mode']
  rules: readonly {
    fieldId: string
    field: Field | undefined
    rule: View['filter']['rules'][number]
  }[]
  index: IndexState
}) => {
  if (!input.rules.length) {
    return true
  }

  const row = input.index.records.rows.get(input.recordId)
  if (!row) {
    return false
  }

  const results = input.rules.map(({ fieldId, field, rule }) => (
    matchFilterRule(
      field,
      fieldId === 'title'
        ? row.title
        : row.values[fieldId],
      rule
    )
  ))

  return input.mode === 'or'
    ? results.some(Boolean)
    : results.every(Boolean)
}

const filterVisibleIds = (input: {
  ids: readonly RecordId[]
  view: View
  document: DataDoc
  index: IndexState
}): readonly RecordId[] => {
  const searchMatches = resolveSearchMatches({
    search: input.view.search,
    index: input.index.search
  })
  const effectiveRules = resolveEffectiveFilterRules(input.document, input.view)

  return input.ids.filter(recordId => {
    if (searchMatches && !searchMatches.has(recordId)) {
      return false
    }

    return matchesFilter({
      recordId,
      mode: input.view.filter.mode,
      rules: effectiveRules,
      index: input.index
    })
  })
}

const buildOrderMap = (
  ids: readonly RecordId[]
): ReadonlyMap<RecordId, number> => new Map(
  ids.map((id, index) => [id, index] as const)
)

export const buildQueryState = (input: {
  document: DataDoc
  view: View
  index: IndexState
  previous?: QueryState
}): QueryState => {
  const derived = sortRecordIds({
    ids: input.index.records.ids,
    document: input.document,
    index: input.index,
    view: input.view
  })
  const ordered = applyViewOrders(derived, input.view)
  const visible = filterVisibleIds({
    ids: ordered,
    view: input.view,
    document: input.document,
    index: input.index
  })

  const previous = input.previous
  const nextDerived = previous && sameIds(previous.derived, derived)
    ? previous.derived
    : derived
  const nextOrdered = previous && sameIds(previous.ordered, ordered)
    ? previous.ordered
    : ordered
  const nextVisible = previous && sameIds(previous.visible, visible)
    ? previous.visible
    : visible

  return {
    derived: nextDerived,
    ordered: nextOrdered,
    visible: nextVisible,
    visibleSet: previous && nextVisible === previous.visible
      ? previous.visibleSet
      : new Set(nextVisible),
    order: previous && nextOrdered === previous.ordered
      ? previous.order
      : buildOrderMap(nextOrdered)
  }
}
