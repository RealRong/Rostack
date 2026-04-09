import type {
  DataDoc,
  Field,
  RecordId,
  Row,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  compareFieldValues
} from '@dataview/core/field'
import {
  isFilterRuleEffective,
  matchFilterRule
} from '@dataview/core/filter'
import type {
  ResolvedViewRecordState
} from '@dataview/core/view'
import {
  applyRecordOrder,
  normalizeRecordOrderIds
} from '@dataview/core/view/order'
import type {
  IndexState,
  SearchIndex,
  SortedIdSet
} from '../index/types'

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
  postings: ReadonlyMap<string, SortedIdSet<RecordId>>,
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
  } else {
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
  row: Row
  mode: View['filter']['mode']
  rules: readonly {
    fieldId: string
    field: Field | undefined
    rule: View['filter']['rules'][number]
  }[]
}) => {
  if (!input.rules.length) {
    return true
  }

  const results = input.rules.map(({ fieldId, field, rule }) => (
    matchFilterRule(
      field,
      fieldId === 'title'
        ? input.row.title
        : input.row.values[fieldId],
      rule
    )
  ))

  return input.mode === 'or'
    ? results.some(Boolean)
    : results.every(Boolean)
}

const filterVisibleIds = (input: {
  ids: readonly RecordId[]
  rows: ReadonlyMap<RecordId, Row>
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

    const row = input.rows.get(recordId)
    if (!row) {
      return false
    }

    return matchesFilter({
      row,
      mode: input.view.filter.mode,
      rules: effectiveRules
    })
  })
}

const materializeRows = (
  ids: readonly RecordId[],
  rows: ReadonlyMap<RecordId, Row>
): readonly Row[] => ids
  .map(recordId => rows.get(recordId))
  .filter((row): row is Row => Boolean(row))

export const resolveIndexedViewRecordState = (input: {
  document: DataDoc
  activeViewId?: ViewId
  index: IndexState
}): ResolvedViewRecordState => {
  const view = input.activeViewId
    ? getDocumentViewById(input.document, input.activeViewId)
    : undefined

  if (!view) {
    return {
      view: undefined,
      derivedRecords: [],
      orderedRecords: [],
      visibleRecords: []
    }
  }

  const baseIds = input.index.records.ids
  const derivedIds = sortRecordIds({
    ids: baseIds,
    document: input.document,
    index: input.index,
    view
  })
  const orderedIds = applyViewOrders(derivedIds, view)
  const visibleIds = filterVisibleIds({
    ids: orderedIds,
    rows: input.index.records.rows,
    view,
    document: input.document,
    index: input.index
  })

  return {
    view,
    derivedRecords: materializeRows(derivedIds, input.index.records.rows),
    orderedRecords: materializeRows(orderedIds, input.index.records.rows),
    visibleRecords: materializeRows(visibleIds, input.index.records.rows)
  }
}
