import type {
  DataDoc,
  Field,
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
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
  matchFilterRule,
  readFilterOptionSetValue
} from '@dataview/core/filter'
import {
  applyRecordOrder,
  normalizeRecordOrderIds
} from '@dataview/core/view/order'
import {
  readGroupFieldIndex
} from '../../../index/group'
import type {
  IndexState,
  SearchIndex,
  SearchTextIndex
} from '../../../index/types'
import type {
  QueryState
} from '../../../contracts/internal'

const sameIds = sameOrder<RecordId>

type EffectiveFilterRule = {
  fieldId: string
  field: Field | undefined
  rule: View['filter']['rules'][number]
}

type FilterCandidate = {
  ids: readonly RecordId[]
  exact: boolean
}

type FilterRulePlan = {
  rule: EffectiveFilterRule
  candidate?: FilterCandidate
}

type SearchPlan = {
  query?: string
  sources: readonly SearchTextIndex[]
  candidates?: readonly RecordId[]
}

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
  if (view.sort.length > 0 || !view.orders.length) {
    return ids
  }

  const normalizedOrders = normalizeRecordOrderIds(
    view.orders,
    new Set(ids)
  )
  return normalizedOrders.length
    ? applyRecordOrder(ids, normalizedOrders)
    : ids
}

const sortIdsByRecordOrder = (
  ids: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => ids.length <= 1
  ? ids
  : ids.slice().sort((left, right) => (
      (order.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
    ))

const intersectCandidates = (
  left: readonly RecordId[],
  right: readonly RecordId[]
): readonly RecordId[] => {
  if (!left.length || !right.length) {
    return []
  }

  const rightSet = new Set(right)
  return left.filter(recordId => rightSet.has(recordId))
}

const unionCandidates = (
  lists: readonly (readonly RecordId[])[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => {
  const ids = new Set<RecordId>()
  lists.forEach(list => {
    list.forEach(recordId => ids.add(recordId))
  })

  return sortIdsByRecordOrder(Array.from(ids), order)
}

const resolveSearchSources = (
  search: View['search'],
  index: SearchIndex
): readonly SearchTextIndex[] => (
  search.fields?.length
    ? search.fields.flatMap(fieldId => {
        const source = index.fields.get(fieldId)
        return source ? [source] : []
      })
    : index.all
      ? [index.all]
      : []
)

const splitSearchTerms = (
  query: string
): readonly string[] => Array.from(new Set(
  query
    .split(/\s+/)
    .flatMap(token => {
      const normalized = trimLowercase(token)
      return normalized ? [normalized] : []
    })
))

const resolveSearchCandidatesForSource = (
  source: SearchTextIndex,
  terms: readonly string[]
): readonly RecordId[] | undefined => {
  if (terms.length < 2) {
    return undefined
  }

  return Array.from(source.texts.entries()).flatMap(([recordId, text]) => (
    terms.every(term => text.includes(term))
      ? [recordId]
      : []
  ))
}

const resolveSearchPlan = (input: {
  search: View['search']
  index: SearchIndex
  recordOrder: ReadonlyMap<RecordId, number>
}): SearchPlan => {
  const query = trimLowercase(input.search.query)
  if (!query) {
    return {
      sources: []
    }
  }

  const sources = resolveSearchSources(input.search, input.index)
  const terms = splitSearchTerms(query)
  const candidateLists = sources
    .flatMap(source => {
      const candidates = resolveSearchCandidatesForSource(source, terms)
      return candidates ? [candidates] : []
    })

  return {
    query,
    sources,
    ...(candidateLists.length
      ? {
          candidates: unionCandidates(candidateLists, input.recordOrder)
        }
      : {})
  }
}

const matchesSearch = (
  recordId: RecordId,
  plan: SearchPlan
): boolean => {
  if (!plan.query) {
    return true
  }

  return plan.sources.some(source => (
    source.texts.get(recordId)?.includes(plan.query!) === true
  ))
}

const resolveEffectiveFilterRules = (
  document: DataDoc,
  view: View
): readonly EffectiveFilterRule[] => view.filter.rules.flatMap(rule => {
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
  rules: readonly EffectiveFilterRule[]
  index: IndexState
}) => {
  if (!input.rules.length) {
    return true
  }

  const row = input.index.records.rows.get(input.recordId)
  if (!row) {
    return false
  }

  if (input.mode === 'or') {
    return input.rules.some(({ fieldId, field, rule }) => (
      matchFilterRule(
        field,
        fieldId === 'title'
          ? row.title
          : row.values[fieldId],
        rule
      )
    ))
  }

  return input.rules.every(({ fieldId, field, rule }) => (
    matchFilterRule(
      field,
      fieldId === 'title'
        ? row.title
        : row.values[fieldId],
      rule
    )
  ))
}

const resolveGroupFilterCandidates = (input: {
  field: Field | undefined
  fieldId: string
  rule: View['filter']['rules'][number]
  index: IndexState
}): FilterCandidate | undefined => {
  const groupIndex = readGroupFieldIndex(input.index.group, {
    field: input.fieldId
  })
  if (!groupIndex) {
    return undefined
  }

  const readBucketIds = (keys: readonly string[]) => (
    unionCandidates(
      keys.map(key => groupIndex.bucketRecords.get(key) ?? []),
      input.index.records.order
    )
  )
  const readRemainingBucketIds = (excludedKeys: ReadonlySet<string>) => (
    unionCandidates(
      Array.from(groupIndex.bucketRecords.entries())
        .flatMap(([key, ids]) => excludedKeys.has(key) ? [] : [ids]),
      input.index.records.order
    )
  )

  switch (input.field?.kind) {
    case 'status':
    case 'select': {
      const optionIds = readFilterOptionSetValue(input.rule.value).optionIds
      switch (input.rule.presetId) {
        case 'eq':
          return {
            ids: optionIds.length ? readBucketIds(optionIds) : [],
            exact: true
          }
        case 'neq':
          return {
            ids: readRemainingBucketIds(new Set(optionIds)),
            exact: true
          }
        case 'exists_true':
          return {
            ids: readRemainingBucketIds(new Set([KANBAN_EMPTY_BUCKET_KEY])),
            exact: true
          }
        case 'exists_false':
          return {
            ids: readBucketIds([KANBAN_EMPTY_BUCKET_KEY]),
            exact: true
          }
        default:
          return undefined
      }
    }
    case 'multiSelect': {
      const optionIds = readFilterOptionSetValue(input.rule.value).optionIds
      switch (input.rule.presetId) {
        case 'contains':
          return {
            ids: optionIds.length ? readBucketIds(optionIds) : [],
            exact: true
          }
        case 'exists_true':
          return {
            ids: readRemainingBucketIds(new Set([KANBAN_EMPTY_BUCKET_KEY])),
            exact: true
          }
        case 'exists_false':
          return {
            ids: readBucketIds([KANBAN_EMPTY_BUCKET_KEY]),
            exact: true
          }
        default:
          return undefined
      }
    }
    case 'boolean':
      switch (input.rule.presetId) {
        case 'checked':
          return {
            ids: readBucketIds(['true']),
            exact: true
          }
        case 'unchecked':
          return {
            ids: readBucketIds(['false']),
            exact: true
          }
        case 'exists_true':
          return {
            ids: readRemainingBucketIds(new Set([KANBAN_EMPTY_BUCKET_KEY])),
            exact: true
          }
        case 'exists_false':
          return {
            ids: readBucketIds([KANBAN_EMPTY_BUCKET_KEY]),
            exact: true
          }
        default:
          return undefined
      }
    default:
      return undefined
  }
}

const lowerBoundByFilter = (input: {
  ids: readonly RecordId[]
  compare: (recordId: RecordId) => number
  accept: (comparison: number) => boolean
}): number => {
  let low = 0
  let high = input.ids.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const comparison = input.compare(input.ids[middle])
    if (input.accept(comparison)) {
      high = middle
      continue
    }

    low = middle + 1
  }

  return low
}

const resolveSortedFilterCandidates = (input: {
  field: Field | undefined
  fieldId: string
  rule: View['filter']['rules'][number]
  index: IndexState
}): FilterCandidate | undefined => {
  if (input.field?.kind !== 'number' && input.field?.kind !== 'date') {
    return undefined
  }

  const sortIndex = input.index.sort.fields.get(input.fieldId)
  if (!sortIndex) {
    return undefined
  }

  if (input.rule.presetId === 'exists_true') {
    return {
      ids: sortIdsByRecordOrder(
        Array.from(input.index.records.values.get(input.fieldId)?.keys() ?? []),
        input.index.records.order
      ),
      exact: true
    }
  }

  const expected = input.rule.value
  const values = input.index.records.values.get(input.fieldId) ?? new Map<RecordId, unknown>()
  const compare = (recordId: RecordId) => compareFieldValues(
    input.field,
    values.get(recordId),
    expected
  )

  switch (input.rule.presetId) {
    case 'eq': {
      const start = lowerBoundByFilter({
        ids: sortIndex.asc,
        compare,
        accept: comparison => comparison >= 0
      })
      const end = lowerBoundByFilter({
        ids: sortIndex.asc,
        compare,
        accept: comparison => comparison > 0
      })
      return {
        ids: sortIdsByRecordOrder(
          sortIndex.asc.slice(start, end),
          input.index.records.order
        ),
        exact: true
      }
    }
    case 'gt': {
      const start = lowerBoundByFilter({
        ids: sortIndex.asc,
        compare,
        accept: comparison => comparison > 0
      })
      return {
        ids: sortIdsByRecordOrder(
          sortIndex.asc.slice(start),
          input.index.records.order
        ),
        exact: true
      }
    }
    case 'gte': {
      const start = lowerBoundByFilter({
        ids: sortIndex.asc,
        compare,
        accept: comparison => comparison >= 0
      })
      return {
        ids: sortIdsByRecordOrder(
          sortIndex.asc.slice(start),
          input.index.records.order
        ),
        exact: true
      }
    }
    case 'lt': {
      const end = lowerBoundByFilter({
        ids: sortIndex.asc,
        compare,
        accept: comparison => comparison >= 0
      })
      return {
        ids: sortIdsByRecordOrder(
          sortIndex.asc.slice(0, end),
          input.index.records.order
        ),
        exact: true
      }
    }
    case 'lte': {
      const end = lowerBoundByFilter({
        ids: sortIndex.asc,
        compare,
        accept: comparison => comparison > 0
      })
      return {
        ids: sortIdsByRecordOrder(
          sortIndex.asc.slice(0, end),
          input.index.records.order
        ),
        exact: true
      }
    }
    default:
      return undefined
  }
}

const resolveFilterCandidatesForRule = (input: {
  rule: EffectiveFilterRule
  index: IndexState
}): FilterCandidate | undefined => (
  resolveGroupFilterCandidates({
    field: input.rule.field,
    fieldId: input.rule.fieldId,
    rule: input.rule.rule,
    index: input.index
  })
    ?? resolveSortedFilterCandidates({
      field: input.rule.field,
      fieldId: input.rule.fieldId,
      rule: input.rule.rule,
      index: input.index
    })
)

const resolveFilterPlans = (input: {
  rules: readonly EffectiveFilterRule[]
  index: IndexState
}): readonly FilterRulePlan[] => input.rules.map(rule => ({
  rule,
  candidate: resolveFilterCandidatesForRule({
    rule,
    index: input.index
  })
}))

const resolveFilterCandidates = (input: {
  plans: readonly FilterRulePlan[]
  mode: View['filter']['mode']
  index: IndexState
}): readonly RecordId[] | undefined => {
  if (!input.plans.length) {
    return undefined
  }

  if (input.mode === 'or') {
    const candidateLists: RecordId[][] = []
    for (const plan of input.plans) {
      if (!plan.candidate) {
        return undefined
      }

      candidateLists.push([...plan.candidate.ids])
    }

    return unionCandidates(candidateLists, input.index.records.order)
  }

  let candidates: readonly RecordId[] | undefined
  input.plans.forEach(plan => {
    if (!plan.candidate) {
      return
    }

    candidates = candidates
      ? intersectCandidates(candidates, plan.candidate.ids)
      : plan.candidate.ids
  })

  return candidates
}

const resolveFilterPredicateRules = (input: {
  plans: readonly FilterRulePlan[]
  mode: View['filter']['mode']
}): readonly EffectiveFilterRule[] => {
  if (input.mode === 'or') {
    return input.plans.every(plan => plan.candidate?.exact)
      ? []
      : input.plans.map(plan => plan.rule)
  }

  return input.plans.flatMap(plan => (
    plan.candidate?.exact
      ? []
      : [plan.rule]
  ))
}

const filterVisibleIds = (input: {
  ids: readonly RecordId[]
  index: IndexState
  searchPlan: SearchPlan
  filterRules: readonly EffectiveFilterRule[]
  filterMode: View['filter']['mode']
}): readonly RecordId[] => input.ids.filter(recordId => {
  if (!matchesSearch(recordId, input.searchPlan)) {
    return false
  }

  return matchesFilter({
    recordId,
    mode: input.filterMode,
    rules: input.filterRules,
    index: input.index
  })
})

export const buildQueryState = (input: {
  document: DataDoc
  view: View
  index: IndexState
  previous?: QueryState
}): QueryState => {
  const searchPlan = resolveSearchPlan({
    search: input.view.search,
    index: input.index.search,
    recordOrder: input.index.records.order
  })
  const effectiveRules = resolveEffectiveFilterRules(input.document, input.view)
  const filterPlans = resolveFilterPlans({
    rules: effectiveRules,
    index: input.index
  })
  const filterCandidates = resolveFilterCandidates({
    plans: filterPlans,
    mode: input.view.filter.mode,
    index: input.index
  })
  const filterPredicateRules = resolveFilterPredicateRules({
    plans: filterPlans,
    mode: input.view.filter.mode
  })
  const hasFilter = effectiveRules.length > 0
  const hasSearch = Boolean(searchPlan.query)

  const matched = sortRecordIds({
    ids: input.index.records.ids,
    document: input.document,
    index: input.index,
    view: input.view
  })
  const ordered = applyViewOrders(matched, input.view)
  const canUseRecordOrderCandidates = ordered === input.index.records.ids
  const candidateIds = canUseRecordOrderCandidates
    ? (
        searchPlan.candidates && filterCandidates
          ? intersectCandidates(searchPlan.candidates, filterCandidates)
          : searchPlan.candidates ?? filterCandidates
      )
    : undefined
  const visible = !hasSearch && !hasFilter
    ? ordered
    : filterVisibleIds({
        ids: candidateIds ?? ordered,
        index: input.index,
        searchPlan,
        filterRules: filterPredicateRules,
        filterMode: input.view.filter.mode
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
    ...(previous && nextVisible === previous.visible && previous.visibleSet
      ? { visibleSet: previous.visibleSet }
      : {}),
    ...(previous && nextOrdered === previous.ordered && previous.order
      ? { order: previous.order }
      : {})
  }
}
