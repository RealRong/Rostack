import type {
  DataDoc,
  Field,
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  sameOrder,
  trimLowercase
} from '@shared/core'
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
} from '../../../index/types'
import type {
  QueryState
} from '../../../contracts/internal'

const sameIds = sameOrder<RecordId>

const sortRecordIds = (input: {
  ids: readonly RecordId[]
  document: DataDoc
  index: IndexState
  view: View
}): readonly RecordId[] => {
  if (!input.view.sort.length) {
    return input.ids
  }

  if (input.view.sort.length === 1) {
    const sorter = input.view.sort[0]
    const fieldIndex = input.index.sort.fields.get(sorter.field)
    if (fieldIndex) {
      return sorter.direction === 'asc'
        ? fieldIndex.asc
        : fieldIndex.desc
    }
  }

  const sorters = input.view.sort.map(sorter => ({
    direction: sorter.direction,
    field: getDocumentFieldById(input.document, sorter.field),
    values: input.index.records.values.get(sorter.field)
  }))

  return input.ids.slice().sort((leftId, rightId) => {
    for (const sorter of sorters) {
      const result = compareFieldValues(
        sorter.field,
        sorter.values?.get(leftId),
        sorter.values?.get(rightId)
      )

      if (result !== 0) {
        return sorter.direction === 'asc'
          ? result
          : -result
      }
    }

    return (input.index.records.order.get(leftId) ?? Number.MAX_SAFE_INTEGER)
      - (input.index.records.order.get(rightId) ?? Number.MAX_SAFE_INTEGER)
  })
}

const applyViewOrders = (
  ids: readonly RecordId[],
  view: View
) => {
  if (view.sort.length > 0) {
    return ids
  }

  const normalizedOrders = normalizeRecordOrderIds(
    view.orders,
    new Set(ids)
  )
  return normalizedOrders.length
    ? applyRecordOrder(ids, normalizedOrders)
    : [...ids]
}

const addMatchedTexts = (
  target: Set<RecordId>,
  texts: ReadonlyMap<RecordId, string>,
  query: string
) => {
  texts.forEach((text, recordId) => {
    if (!text.includes(query)) {
      return
    }

    target.add(recordId)
  })
}

const resolveSearchMatches = (input: {
  search: View['search']
  index: SearchIndex
}): ReadonlySet<RecordId> | undefined => {
  const query = trimLowercase(input.search.query)
  if (!query) {
    return undefined
  }

  const matches = new Set<RecordId>()
  if (input.search.fields?.length) {
    input.search.fields.forEach(fieldId => {
      const texts = input.index.fields.get(fieldId)
      if (!texts) {
        return
      }

      addMatchedTexts(matches, texts, query)
    })
  } else if (input.index.all) {
    addMatchedTexts(matches, input.index.all, query)
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
  searchMatches?: ReadonlySet<RecordId>
  effectiveRules?: readonly {
    fieldId: string
    field: Field | undefined
    rule: View['filter']['rules'][number]
  }[]
}): readonly RecordId[] => {
  const searchMatches = input.searchMatches
  const effectiveRules = input.effectiveRules ?? resolveEffectiveFilterRules(input.document, input.view)

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

export const buildQueryState = (input: {
  document: DataDoc
  view: View
  index: IndexState
  previous?: QueryState
}): QueryState => {
  const searchMatches = resolveSearchMatches({
    search: input.view.search,
    index: input.index.search
  })
  const effectiveRules = resolveEffectiveFilterRules(input.document, input.view)
  const hasFilter = effectiveRules.length > 0
  const hasSearch = Boolean(searchMatches)

  const matched = sortRecordIds({
    ids: input.index.records.ids,
    document: input.document,
    index: input.index,
    view: input.view
  })
  const ordered = applyViewOrders(matched, input.view)
  const visible = !hasSearch && !hasFilter
    ? ordered
    : filterVisibleIds({
        ids: ordered,
        view: input.view,
        document: input.document,
        index: input.index,
        searchMatches,
        effectiveRules
      })

  const previous = input.previous
  const nextMatched = previous && sameIds(previous.matched, matched)
    ? previous.matched
    : matched
  const nextOrdered = previous && sameIds(previous.ordered, ordered)
    ? previous.ordered
    : ordered
  const nextVisible = previous && sameIds(previous.visible, visible)
    ? previous.visible
    : visible

  return {
    matched: nextMatched,
    ordered: nextOrdered,
    visible: nextVisible,
    visibleSet: previous && nextVisible === previous.visible
      ? previous.visibleSet
      : new Set(nextVisible),
    order: previous && nextOrdered === previous.ordered
      ? previous.order
      : new Map(nextOrdered.map((id, index) => [id, index] as const))
  }
}
