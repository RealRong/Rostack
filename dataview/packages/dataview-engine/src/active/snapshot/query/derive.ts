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
  readFilterBucketIndex
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

type SearchMatches = {
  query: string
  sourceKey: string
  sourceRev: number
  sources: readonly SearchTextIndex[]
  matched: readonly RecordId[]
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()
const EMPTY_SEARCH_SOURCES = [] as readonly SearchTextIndex[]
const EMPTY_SEARCH_GRAMS = [] as readonly string[]
const SEARCH_SOURCE_SEPARATOR = '\u0000'
const REVERSED_SORT_IDS = new WeakMap<readonly RecordId[], readonly RecordId[]>()

interface CandidateScratch {
  count: Uint32Array
  generation: number
  seenList: Uint32Array
  stamp: Uint32Array
}

const CANDIDATE_SCRATCH_BY_RECORDS = new WeakMap<readonly RecordId[], CandidateScratch>()

const readCandidateScratch = (
  recordIds: readonly RecordId[]
): CandidateScratch => {
  const cached = CANDIDATE_SCRATCH_BY_RECORDS.get(recordIds)
  if (cached) {
    return cached
  }

  const created: CandidateScratch = {
    stamp: new Uint32Array(recordIds.length),
    count: new Uint32Array(recordIds.length),
    seenList: new Uint32Array(recordIds.length),
    generation: 1
  }
  CANDIDATE_SCRATCH_BY_RECORDS.set(recordIds, created)
  return created
}

const nextScratchGeneration = (
  scratch: CandidateScratch
): number => {
  if (scratch.generation === 0xffffffff) {
    scratch.stamp.fill(0)
    scratch.count.fill(0)
    scratch.seenList.fill(0)
    scratch.generation = 1
    return scratch.generation
  }

  scratch.generation += 1
  return scratch.generation
}

const projectIdsByMembership = (input: {
  orderedIds: readonly RecordId[]
  candidateIds: readonly RecordId[]
  allRecordIds: readonly RecordId[]
  order: ReadonlyMap<RecordId, number>
  reverse?: boolean
}): readonly RecordId[] => {
  if (!input.orderedIds.length || !input.candidateIds.length) {
    return []
  }

  const scratch = readCandidateScratch(input.allRecordIds)
  const generation = nextScratchGeneration(scratch)
  input.candidateIds.forEach(recordId => {
    const ordinal = input.order.get(recordId)
    if (ordinal !== undefined) {
      scratch.stamp[ordinal] = generation
    }
  })

  const projected: RecordId[] = []
  if (!input.reverse) {
    for (let index = 0; index < input.orderedIds.length; index += 1) {
      const recordId = input.orderedIds[index]!
      const ordinal = input.order.get(recordId)
      if (ordinal !== undefined && scratch.stamp[ordinal] === generation) {
        projected.push(recordId)
      }
    }
    return projected
  }

  for (let index = input.orderedIds.length - 1; index >= 0; index -= 1) {
    const recordId = input.orderedIds[index]!
    const ordinal = input.order.get(recordId)
    if (ordinal !== undefined && scratch.stamp[ordinal] === generation) {
      projected.push(recordId)
    }
  }

  return projected
}

const collectCandidateLists = (input: {
  lists: readonly (readonly RecordId[])[]
  scanOrder: readonly RecordId[]
  allRecordIds: readonly RecordId[]
  order: ReadonlyMap<RecordId, number>
  requireAll?: boolean
}): readonly RecordId[] => {
  if (!input.lists.length || !input.scanOrder.length) {
    return []
  }

  const scratch = readCandidateScratch(input.allRecordIds)
  const generation = nextScratchGeneration(scratch)

  input.lists.forEach((list, listIndex) => {
    const listToken = listIndex + 1
    list.forEach(recordId => {
      const ordinal = input.order.get(recordId)
      if (ordinal === undefined) {
        return
      }

      if (scratch.stamp[ordinal] !== generation) {
        scratch.stamp[ordinal] = generation
        scratch.count[ordinal] = 0
        scratch.seenList[ordinal] = 0
      }

      if (scratch.seenList[ordinal] === listToken) {
        return
      }

      scratch.seenList[ordinal] = listToken
      scratch.count[ordinal] += 1
    })
  })

  const requiredCount = input.requireAll
    ? input.lists.length
    : 1
  const collected: RecordId[] = []
  input.scanOrder.forEach(recordId => {
    const ordinal = input.order.get(recordId)
    if (
      ordinal !== undefined
      && scratch.stamp[ordinal] === generation
      && scratch.count[ordinal] >= requiredCount
    ) {
      collected.push(recordId)
    }
  })

  return collected
}

const projectIdsToCurrentOrder = (
  orderedIds: readonly RecordId[],
  currentIds: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>,
  reverse = false
): readonly RecordId[] => projectIdsByMembership({
  orderedIds,
  candidateIds: currentIds,
  allRecordIds,
  order,
  reverse
})

const reverseOrderedIds = (
  ids: readonly RecordId[]
): readonly RecordId[] => {
  if (ids.length <= 1) {
    return ids
  }

  const cached = REVERSED_SORT_IDS.get(ids)
  if (cached) {
    return cached
  }

  const reversed = new Array<RecordId>(ids.length)
  for (let index = 0; index < ids.length; index += 1) {
    reversed[index] = ids[ids.length - index - 1]!
  }
  REVERSED_SORT_IDS.set(ids, reversed)
  return reversed
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
      if (input.ids === input.index.records.ids) {
        return sorter.direction === 'desc'
          ? reverseOrderedIds(fieldIndex.asc)
          : fieldIndex.asc
      }

      return projectIdsToCurrentOrder(
        fieldIndex.asc,
        input.ids,
        input.index.records.ids,
        input.index.records.order,
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
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => collectCandidateLists({
  lists: [ids],
  scanOrder: allRecordIds,
  allRecordIds,
  order
})

const intersectCandidates = (
  left: readonly RecordId[],
  right: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => collectCandidateLists({
  lists: [left, right],
  scanOrder: allRecordIds,
  allRecordIds,
  order,
  requireAll: true
})

const unionCandidates = (
  lists: readonly (readonly RecordId[])[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => collectCandidateLists({
  lists,
  scanOrder: allRecordIds,
  allRecordIds,
  order
})

const resolveSearchSources = (
  search: View['search'],
  index: SearchIndex
): {
  key: string
  sources: readonly SearchTextIndex[]
} => {
  if (!search.fields?.length) {
    return {
      key: 'all',
      sources: index.all
        ? [index.all]
        : EMPTY_SEARCH_SOURCES
    }
  }

  const sources: SearchTextIndex[] = []
  for (let indexOfField = 0; indexOfField < search.fields.length; indexOfField += 1) {
    const fieldId = search.fields[indexOfField]!
    const source = index.fields.get(fieldId)
    if (source) {
      sources.push(source)
    }
  }

  return {
    key: search.fields.join(SEARCH_SOURCE_SEPARATOR),
    sources: sources.length
      ? sources
      : EMPTY_SEARCH_SOURCES
  }
}

const collectSearchGrams = (
  query: string
): readonly string[] => {
  const size = query.length >= 3
    ? 3
    : query.length >= 2
      ? 2
      : 0
  if (!size) {
    return EMPTY_SEARCH_GRAMS
  }

  const grams = new Set<string>()
  const maxStart = query.length - size
  for (let index = 0; index <= maxStart; index += 1) {
    grams.add(query.slice(index, index + size))
  }

  return grams.size
    ? [...grams]
    : EMPTY_SEARCH_GRAMS
}

const resolveIndexedSearchCandidatesForSource = (input: {
  source: SearchTextIndex
  query: string
  allRecordIds: readonly RecordId[]
  recordOrder: ReadonlyMap<RecordId, number>
}): readonly RecordId[] | undefined => {
  const grams = collectSearchGrams(input.query)
  if (!grams.length) {
    return undefined
  }

  const postings = input.query.length >= 3
    ? input.source.trigrams
    : input.source.bigrams
  const lists: RecordId[][] = []

  for (let index = 0; index < grams.length; index += 1) {
    const ids = postings.get(grams[index]!)
    if (!ids?.length) {
      return EMPTY_RECORD_IDS
    }

    lists.push(ids as RecordId[])
  }

  return collectCandidateLists({
    lists,
    scanOrder: input.allRecordIds,
    allRecordIds: input.allRecordIds,
    order: input.recordOrder,
    requireAll: true
  })
}

const resolveExactSearchCandidatesForSource = (
  source: SearchTextIndex,
  query: string
): readonly RecordId[] => {
  const candidates: RecordId[] = []

  for (const [recordId, text] of source.texts) {
    if (text.includes(query)) {
      candidates.push(recordId)
    }
  }

  return candidates.length
    ? candidates
    : EMPTY_RECORD_IDS
}

const filterExactSearchCandidates = (input: {
  ids: readonly RecordId[]
  query: string
  sources: readonly SearchTextIndex[]
}): readonly RecordId[] => {
  const candidates: RecordId[] = []

  for (let index = 0; index < input.ids.length; index += 1) {
    const recordId = input.ids[index]!
    if (input.sources.some(source => source.texts.get(recordId)?.includes(input.query) === true)) {
      candidates.push(recordId)
    }
  }

  return candidates.length
    ? candidates
    : EMPTY_RECORD_IDS
}

const resolveSearchMatches = (input: {
  search: View['search']
  index: SearchIndex
  allRecordIds: readonly RecordId[]
  recordOrder: ReadonlyMap<RecordId, number>
  previous?: QueryState
}): SearchMatches | undefined => {
  const query = trimLowercase(input.search.query)
  if (!query) {
    return undefined
  }

  const resolvedSources = resolveSearchSources(input.search, input.index)
  if (!resolvedSources.sources.length) {
    return {
      query,
      sourceKey: resolvedSources.key,
      sourceRev: input.index.rev,
      sources: resolvedSources.sources,
      matched: EMPTY_RECORD_IDS
    }
  }

  const previousSearch = input.previous?.search
  if (
    previousSearch
    && previousSearch.sourceKey === resolvedSources.key
    && previousSearch.sourceRev === input.index.rev
    && query.startsWith(previousSearch.query)
  ) {
    return {
      query,
      sourceKey: resolvedSources.key,
      sourceRev: input.index.rev,
      sources: resolvedSources.sources,
      matched: filterExactSearchCandidates({
        ids: previousSearch.matched,
        query,
        sources: resolvedSources.sources
      })
    }
  }

  return {
    query,
    sourceKey: resolvedSources.key,
    sourceRev: input.index.rev,
    sources: resolvedSources.sources,
    matched: (() => {
      const exactCandidateLists: RecordId[][] = []

      if (query.length < 2) {
        for (let index = 0; index < resolvedSources.sources.length; index += 1) {
          const candidates = resolveExactSearchCandidatesForSource(resolvedSources.sources[index]!, query)
          if (candidates.length) {
            exactCandidateLists.push(candidates as RecordId[])
          }
        }

        return exactCandidateLists.length
          ? unionCandidates(exactCandidateLists, input.allRecordIds, input.recordOrder)
          : EMPTY_RECORD_IDS
      }

      const candidateLists: RecordId[][] = []
      for (let index = 0; index < resolvedSources.sources.length; index += 1) {
        const candidates = resolveIndexedSearchCandidatesForSource({
          source: resolvedSources.sources[index]!,
          query,
          allRecordIds: input.allRecordIds,
          recordOrder: input.recordOrder
        })
        if (candidates?.length) {
          candidateLists.push(candidates as RecordId[])
        }
      }

      const candidatePool = candidateLists.length
        ? unionCandidates(candidateLists, input.allRecordIds, input.recordOrder)
        : EMPTY_RECORD_IDS
      return filterExactSearchCandidates({
        ids: candidatePool,
        query,
        sources: resolvedSources.sources
      })
    })()
  }
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
  const groupIndex = readFilterBucketIndex(input.index.group, input.fieldId)
  if (!groupIndex) {
    return undefined
  }

  const readBucketIds = (keys: readonly string[]) => {
    if (!keys.length) {
      return EMPTY_RECORD_IDS
    }

    if (keys.length === 1) {
      return groupIndex.bucketRecords.get(keys[0]!) ?? EMPTY_RECORD_IDS
    }

    return unionCandidates(
      keys.map(key => groupIndex.bucketRecords.get(key) ?? EMPTY_RECORD_IDS),
      input.index.records.ids,
      input.index.records.order
    )
  }
  const readRemainingBucketIds = (excludedKeys: ReadonlySet<string>) => (
    excludedKeys.size === 0
      ? input.index.records.ids
      : excludedKeys.size >= groupIndex.bucketRecords.size
        ? EMPTY_RECORD_IDS
        :
    unionCandidates(
      Array.from(groupIndex.bucketRecords.entries())
        .flatMap(([key, ids]) => excludedKeys.has(key) ? [] : [ids]),
      input.index.records.ids,
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
        input.index.records.ids,
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
          input.index.records.ids,
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
          input.index.records.ids,
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
          input.index.records.ids,
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
          input.index.records.ids,
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
          input.index.records.ids,
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

    return unionCandidates(
      candidateLists,
      input.index.records.ids,
      input.index.records.order
    )
  }

  let candidates: readonly RecordId[] | undefined
  input.plans.forEach(plan => {
    if (!plan.candidate) {
      return
    }

    candidates = candidates
      ? intersectCandidates(
          candidates,
          plan.candidate.ids,
          input.index.records.ids,
          input.index.records.order
        )
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
  filterRules: readonly EffectiveFilterRule[]
  filterMode: View['filter']['mode']
}): readonly RecordId[] => {
  const visible: RecordId[] = []

  for (let index = 0; index < input.ids.length; index += 1) {
    const recordId = input.ids[index]!
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
  candidates: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => projectIdsByMembership({
  orderedIds: ordered,
  candidateIds: candidates,
  allRecordIds,
  order
})

const publishQueryState = (input: {
  previous?: QueryState
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
  search?: SearchMatches
}): QueryState => {
  const previous = input.previous
  const nextMatched = previous && sameOrder(previous.records.matched, input.matched)
    ? previous.records.matched
    : input.matched
  const nextOrdered = previous && sameOrder(previous.records.ordered, input.ordered)
    ? previous.records.ordered
    : input.ordered
  const nextVisible = previous && sameOrder(previous.records.visible, input.visible)
    ? previous.records.visible
    : input.visible
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
    ...(input.search
      ? {
          search: previous?.search
            && previous.search.query === input.search.query
            && previous.search.sourceKey === input.search.sourceKey
            && previous.search.sourceRev === input.search.sourceRev
            && sameOrder(previous.search.matched, input.search.matched)
              ? previous.search
              : {
                  query: input.search.query,
                  sourceKey: input.search.sourceKey,
                  sourceRev: input.search.sourceRev,
                  matched: input.search.matched
                }
        }
      : {}),
    ...(previous && nextVisible === previous.records.visible && previous.visibleSet
      ? { visibleSet: previous.visibleSet }
      : {}),
    ...(previous && nextOrdered === previous.records.ordered && previous.order
      ? { order: previous.order }
      : {})
  }
}

export const buildQueryState = (input: {
  reader: DocumentReader
  view: View
  index: IndexState
  previous?: QueryState
}): QueryState => {
  if (
    !trimLowercase(input.view.search.query)
    && input.view.filter.rules.length === 0
  ) {
    const matched = sortRecordIds({
      ids: input.index.records.ids,
      reader: input.reader,
      index: input.index,
      view: input.view
    })
    const ordered = applyViewOrders(matched, input.view, input.reader)

    return publishQueryState({
      previous: input.previous,
      matched,
      ordered,
      visible: ordered
    })
  }

  const searchMatches = resolveSearchMatches({
    search: input.view.search,
    index: input.index.search,
    allRecordIds: input.index.records.ids,
    recordOrder: input.index.records.order,
    previous: input.previous
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
  const hasSearch = Boolean(searchMatches)
  const needsFilterPredicate = filterPredicateRules.length > 0

  const matched = sortRecordIds({
    ids: input.index.records.ids,
    reader: input.reader,
    index: input.index,
    view: input.view
  })
  const ordered = applyViewOrders(matched, input.view, input.reader)
  const candidatePool = (
    searchMatches?.matched && filterCandidates
      ? intersectCandidates(
          searchMatches.matched,
          filterCandidates,
          input.index.records.ids,
          input.index.records.order
        )
      : searchMatches?.matched ?? filterCandidates
  )
  const candidateIds = candidatePool
    ? ordered === input.index.records.ids
      ? candidatePool
      : projectCandidatesToOrderedIds(
          ordered,
          candidatePool,
          input.index.records.ids,
          input.index.records.order
        )
    : undefined
  const visible = !hasSearch && !hasFilter
    ? ordered
    : candidateIds && !needsFilterPredicate
      ? candidateIds
    : filterVisibleIds({
        ids: candidateIds ?? ordered,
        index: input.index,
        filterRules: filterPredicateRules,
        filterMode: input.view.filter.mode
      })

  return publishQueryState({
    previous: input.previous,
    matched,
    ordered,
    visible,
    search: searchMatches
  })
}
