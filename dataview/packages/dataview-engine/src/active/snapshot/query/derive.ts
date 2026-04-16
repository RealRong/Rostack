import type {
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
  compareFieldValues
} from '@dataview/core/field'
import {
  isFilterRuleEffective,
  matchFilterRule,
  readFilterOptionSetValue
} from '@dataview/core/filter'
import {
  applyRecordOrder
} from '@dataview/core/view/order'
import {
  readGroupFieldIndex
} from '@dataview/engine/active/index/group/demand'
import type {
  IndexState,
  SearchIndex,
  SearchTextIndex
} from '@dataview/engine/active/index/contracts'
import type {
  QueryState
} from '@dataview/engine/contracts/internal'
import {
  type DocumentReader
} from '@dataview/engine/document/reader'

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

const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()
const EMPTY_SEARCH_SOURCES = [] as readonly SearchTextIndex[]
const EMPTY_SEARCH_TERMS = [] as readonly string[]

const projectIdsToCurrentOrder = (
  orderedIds: readonly RecordId[],
  currentIds: readonly RecordId[],
  reverse = false
): readonly RecordId[] => {
  if (!orderedIds.length || !currentIds.length) {
    return []
  }

  const currentIdSet = new Set(currentIds)
  if (!reverse) {
    return orderedIds.filter(recordId => currentIdSet.has(recordId))
  }

  const projected: RecordId[] = []
  for (let index = orderedIds.length - 1; index >= 0; index -= 1) {
    const recordId = orderedIds[index]
    if (currentIdSet.has(recordId)) {
      projected.push(recordId)
    }
  }

  return projected
}

const sortRecordIds = (input: {
  ids: readonly RecordId[]
  reader: DocumentReader
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
      return projectIdsToCurrentOrder(
        fieldIndex.asc,
        input.ids,
        sorter.direction === 'desc'
      )
    }
  }

  const sorters = input.view.sort.map(sorter => ({
    direction: sorter.direction,
    field: input.reader.fields.get(sorter.field),
    values: input.index.records.values.get(sorter.field)?.byRecord
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
  view: View,
  reader: DocumentReader
) => {
  if (view.sort.length > 0 || !view.orders.length) {
    return ids
  }

  const normalizedOrders = reader.records.normalize(view.orders, ids)
  return normalizedOrders.length
    ? applyRecordOrder(ids, normalizedOrders)
    : ids
}

const sortIdsByRecordOrder = (
  ids: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => {
  const presentIds = ids.filter(recordId => order.has(recordId))
  return presentIds.length <= 1
    ? presentIds
    : presentIds.slice().sort((left, right) => (
        (order.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
      ))
}

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
): readonly SearchTextIndex[] => {
  if (!search.fields?.length) {
    return index.all
      ? [index.all]
      : EMPTY_SEARCH_SOURCES
  }

  const sources: SearchTextIndex[] = []
  for (let indexOfField = 0; indexOfField < search.fields.length; indexOfField += 1) {
    const fieldId = search.fields[indexOfField]!
    const source = index.fields.get(fieldId)
    if (source) {
      sources.push(source)
    }
  }

  return sources.length
    ? sources
    : EMPTY_SEARCH_SOURCES
}

const splitSearchTerms = (
  query: string
): readonly string[] => {
  const terms: string[] = []
  const seen = new Set<string>()
  let start = -1

  for (let index = 0; index <= query.length; index += 1) {
    const character = index < query.length
      ? query.charCodeAt(index)
      : 32

    if (character <= 32) {
      if (start < 0) {
        continue
      }

      const term = trimLowercase(query.slice(start, index))
      start = -1
      if (!term || seen.has(term)) {
        continue
      }

      seen.add(term)
      terms.push(term)
      continue
    }

    if (start < 0) {
      start = index
    }
  }

  return terms.length
    ? terms
    : EMPTY_SEARCH_TERMS
}

const resolveSearchCandidatesForSource = (
  source: SearchTextIndex,
  terms: readonly string[]
): readonly RecordId[] | undefined => {
  if (terms.length < 2) {
    return undefined
  }

  const candidates: RecordId[] = []

  scan: for (const [recordId, text] of source.texts) {
    for (let index = 0; index < terms.length; index += 1) {
      if (!text.includes(terms[index]!)) {
        continue scan
      }
    }

    candidates.push(recordId)
  }

  return candidates.length
    ? candidates
    : undefined
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
  const candidateLists: RecordId[][] = []

  for (let index = 0; index < sources.length; index += 1) {
    const candidates = resolveSearchCandidatesForSource(sources[index]!, terms)
    if (candidates?.length) {
      candidateLists.push(candidates as RecordId[])
    }
  }

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
  reader: DocumentReader,
  view: View
): readonly EffectiveFilterRule[] => {
  const rules: EffectiveFilterRule[] = []

  for (let index = 0; index < view.filter.rules.length; index += 1) {
    const rule = view.filter.rules[index]!
    const field = reader.fields.get(rule.fieldId)
    if (isFilterRuleEffective(field, rule)) {
      rules.push({
        fieldId: rule.fieldId,
        field,
        rule
      })
    }
  }

  return rules
}

const matchesFilter = (input: {
  recordId: RecordId
  mode: View['filter']['mode']
  rules: readonly EffectiveFilterRule[]
  index: IndexState
}) => {
  if (!input.rules.length) {
    return true
  }

  const row = input.index.records.byId[input.recordId]
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
        input.index.records.values.get(input.fieldId)?.ids ?? [],
        input.index.records.order
      ),
      exact: true
    }
  }

  const expected = input.rule.value
  const values = input.index.records.values.get(input.fieldId)?.byRecord ?? EMPTY_VALUE_MAP
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

  const rules: EffectiveFilterRule[] = []
  for (let index = 0; index < input.plans.length; index += 1) {
    const plan = input.plans[index]!
    if (!plan.candidate?.exact) {
      rules.push(plan.rule)
    }
  }

  return rules
}

const filterVisibleIds = (input: {
  ids: readonly RecordId[]
  index: IndexState
  searchPlan: SearchPlan
  filterRules: readonly EffectiveFilterRule[]
  filterMode: View['filter']['mode']
}): readonly RecordId[] => {
  const visible: RecordId[] = []

  for (let index = 0; index < input.ids.length; index += 1) {
    const recordId = input.ids[index]!
    if (!matchesSearch(recordId, input.searchPlan)) {
      continue
    }

    if (matchesFilter({
      recordId,
      mode: input.filterMode,
      rules: input.filterRules,
      index: input.index
    })) {
      visible.push(recordId)
    }
  }

  return visible
}

const projectCandidatesToOrderedIds = (
  ordered: readonly RecordId[],
  candidates: readonly RecordId[]
): readonly RecordId[] => {
  if (!candidates.length) {
    return []
  }

  const candidateSet = new Set(candidates)
  return ordered.filter(recordId => candidateSet.has(recordId))
}

export const buildQueryState = (input: {
  reader: DocumentReader
  view: View
  index: IndexState
  previous?: QueryState
}): QueryState => {
  const searchPlan = resolveSearchPlan({
    search: input.view.search,
    index: input.index.search,
    recordOrder: input.index.records.order
  })
  const effectiveRules = resolveEffectiveFilterRules(input.reader, input.view)
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
    reader: input.reader,
    index: input.index,
    view: input.view
  })
  const ordered = applyViewOrders(matched, input.view, input.reader)
  const candidatePool = (
    searchPlan.candidates && filterCandidates
      ? intersectCandidates(searchPlan.candidates, filterCandidates)
      : searchPlan.candidates ?? filterCandidates
  )
  const candidateIds = candidatePool
    ? projectCandidatesToOrderedIds(ordered, candidatePool)
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
  const nextMatched = previous && sameOrder(previous.records.matched, matched)
    ? previous.records.matched
    : matched
  const nextOrdered = previous && sameOrder(previous.records.ordered, ordered)
    ? previous.records.ordered
    : ordered
  const nextVisible = previous && sameOrder(previous.records.visible, visible)
    ? previous.records.visible
    : visible
  const nextRecords = previous
    && nextMatched === previous.records.matched
    && nextOrdered === previous.records.ordered
    && nextVisible === previous.records.visible
    ? previous.records
    : {
        matched: nextMatched,
        ordered: nextOrdered,
        visible: nextVisible
      }

  return {
    records: nextRecords,
    ...(previous && nextVisible === previous.records.visible && previous.visibleSet
      ? { visibleSet: previous.visibleSet }
      : {}),
    ...(previous && nextOrdered === previous.records.ordered && previous.order
      ? { order: previous.order }
      : {})
  }
}
