import type {
  Field,
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  sameOrder,
  trimLowercase
} from '@shared/core'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  applyRecordOrder
} from '@dataview/core/view/order'
import type {
  QueryPlan,
  EffectiveFilterRule
} from '@dataview/engine/active/plan'
import {
  createBucketSpec,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
import type {
  IndexState,
  SearchFieldIndex,
  SearchIndex,
} from '@dataview/engine/active/index/contracts'
import type {
  QueryState
} from '@dataview/engine/contracts/internal'
import {
  type DocumentReader
} from '@dataview/engine/document/reader'

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
  sourceRevisionKey: string
  sources: readonly SearchFieldIndex[]
  matched: readonly RecordId[]
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()
const EMPTY_SEARCH_SOURCES = [] as readonly SearchFieldIndex[]
const EMPTY_SEARCH_GRAMS = [] as readonly string[]
const SEARCH_SOURCE_SEPARATOR = '\u0000'
const REVERSED_SORT_IDS = new WeakMap<readonly RecordId[], readonly RecordId[]>()
const EMPTY_LAST_REVERSED_SORT_IDS = new WeakMap<readonly RecordId[], readonly RecordId[]>()
const ORDER_ORDINALS_BY_IDS = new WeakMap<
  readonly RecordId[],
  WeakMap<ReadonlyMap<RecordId, number>, Int32Array>
>()

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

const readOrderOrdinals = (
  ids: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): Int32Array => {
  const cachedByOrder = ORDER_ORDINALS_BY_IDS.get(ids)
  const cached = cachedByOrder?.get(order)
  if (cached) {
    return cached
  }

  const ordinals = new Int32Array(ids.length)
  for (let index = 0; index < ids.length; index += 1) {
    ordinals[index] = order.get(ids[index]!) ?? -1
  }

  const nextByOrder = cachedByOrder ?? new WeakMap<ReadonlyMap<RecordId, number>, Int32Array>()
  nextByOrder.set(order, ordinals)
  if (!cachedByOrder) {
    ORDER_ORDINALS_BY_IDS.set(ids, nextByOrder)
  }

  return ordinals
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
  const candidateOrdinals = readOrderOrdinals(input.candidateIds, input.order)
  for (let index = 0; index < input.candidateIds.length; index += 1) {
    const ordinal = candidateOrdinals[index]!
    if (ordinal >= 0) {
      scratch.stamp[ordinal] = generation
    }
  }

  const projected: RecordId[] = []
  const orderedOrdinals = readOrderOrdinals(input.orderedIds, input.order)
  if (!input.reverse) {
    for (let index = 0; index < input.orderedIds.length; index += 1) {
      const recordId = input.orderedIds[index]!
      const ordinal = orderedOrdinals[index]!
      if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
        projected.push(recordId)
      }
    }
    return projected
  }

  for (let index = input.orderedIds.length - 1; index >= 0; index -= 1) {
    const recordId = input.orderedIds[index]!
    const ordinal = orderedOrdinals[index]!
    if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
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

  for (let listIndex = 0; listIndex < input.lists.length; listIndex += 1) {
    const list = input.lists[listIndex]!
    const listToken = listIndex + 1
    const ordinals = readOrderOrdinals(list, input.order)
    for (let index = 0; index < list.length; index += 1) {
      const ordinal = ordinals[index]!
      if (ordinal < 0) {
        continue
      }

      if (scratch.stamp[ordinal] !== generation) {
        scratch.stamp[ordinal] = generation
        scratch.count[ordinal] = 0
        scratch.seenList[ordinal] = 0
      }

      if (scratch.seenList[ordinal] === listToken) {
        continue
      }

      scratch.seenList[ordinal] = listToken
      scratch.count[ordinal] += 1
    }
  }

  const requiredCount = input.requireAll
    ? input.lists.length
    : 1
  const collected: RecordId[] = []
  const scanOrdinals = readOrderOrdinals(input.scanOrder, input.order)
  for (let index = 0; index < input.scanOrder.length; index += 1) {
    const ordinal = scanOrdinals[index]!
    if (
      ordinal >= 0
      && scratch.stamp[ordinal] === generation
      && scratch.count[ordinal] >= requiredCount
    ) {
      collected.push(input.scanOrder[index]!)
    }
  }

  return collected
}

const projectIdsToCurrentOrder = (
  orderedIds: readonly RecordId[],
  currentIds: readonly RecordId[],
  allRecordIds: readonly RecordId[],
  order: ReadonlyMap<RecordId, number>
): readonly RecordId[] => projectIdsByMembership({
  orderedIds,
  candidateIds: currentIds,
  allRecordIds,
  order
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

const findEmptyTailStart = (input: {
  ids: readonly RecordId[]
  values: ReadonlyMap<RecordId, unknown>
}): number => {
  let start = input.ids.length

  while (start > 0) {
    const recordId = input.ids[start - 1]!
    if (!fieldApi.value.empty(input.values.get(recordId))) {
      break
    }

    start -= 1
  }

  return start
}

const reverseOrderedIdsKeepingEmptyLast = (input: {
  ids: readonly RecordId[]
  values: ReadonlyMap<RecordId, unknown>
}): readonly RecordId[] => {
  if (input.ids.length <= 1) {
    return input.ids
  }

  const emptyTailStart = findEmptyTailStart(input)
  if (emptyTailStart === input.ids.length) {
    return reverseOrderedIds(input.ids)
  }

  const cached = EMPTY_LAST_REVERSED_SORT_IDS.get(input.ids)
  if (cached) {
    return cached
  }

  const reversed = new Array<RecordId>(input.ids.length)
  let cursor = 0

  for (let index = emptyTailStart - 1; index >= 0; index -= 1) {
    reversed[cursor] = input.ids[index]!
    cursor += 1
  }
  for (let index = emptyTailStart; index < input.ids.length; index += 1) {
    reversed[cursor] = input.ids[index]!
    cursor += 1
  }

  EMPTY_LAST_REVERSED_SORT_IDS.set(input.ids, reversed)
  return reversed
}

const projectIdsToCurrentOrderKeepingEmptyLast = (input: {
  orderedIds: readonly RecordId[]
  currentIds: readonly RecordId[]
  allRecordIds: readonly RecordId[]
  order: ReadonlyMap<RecordId, number>
  values: ReadonlyMap<RecordId, unknown>
}): readonly RecordId[] => {
  if (!input.orderedIds.length || !input.currentIds.length) {
    return EMPTY_RECORD_IDS
  }

  const scratch = readCandidateScratch(input.allRecordIds)
  const generation = nextScratchGeneration(scratch)
  const candidateOrdinals = readOrderOrdinals(input.currentIds, input.order)
  for (let index = 0; index < input.currentIds.length; index += 1) {
    const ordinal = candidateOrdinals[index]!
    if (ordinal >= 0) {
      scratch.stamp[ordinal] = generation
    }
  }

  const emptyTailStart = findEmptyTailStart({
    ids: input.orderedIds,
    values: input.values
  })
  const ordinals = readOrderOrdinals(input.orderedIds, input.order)
  const projected: RecordId[] = []

  for (let index = emptyTailStart - 1; index >= 0; index -= 1) {
    const ordinal = ordinals[index]!
    if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
      projected.push(input.orderedIds[index]!)
    }
  }
  for (let index = emptyTailStart; index < input.orderedIds.length; index += 1) {
    const ordinal = ordinals[index]!
    if (ordinal >= 0 && scratch.stamp[ordinal] === generation) {
      projected.push(input.orderedIds[index]!)
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
      const fieldValues = input.index.records.values.get(sorter.field)?.byRecord ?? EMPTY_VALUE_MAP
      if (input.ids === input.index.records.ids) {
        return sorter.direction === 'desc'
          ? reverseOrderedIdsKeepingEmptyLast({
              ids: fieldIndex.asc,
              values: fieldValues
            })
          : fieldIndex.asc
      }

      return sorter.direction === 'desc'
        ? projectIdsToCurrentOrderKeepingEmptyLast({
            orderedIds: fieldIndex.asc,
            currentIds: input.ids,
            allRecordIds: input.index.records.ids,
            order: input.index.records.order,
            values: fieldValues
          })
        : projectIdsToCurrentOrder(
            fieldIndex.asc,
            input.ids,
            input.index.records.ids,
            input.index.records.order
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
      const result = fieldApi.compare.sort(
        sorter.field,
        sorter.values?.get(leftId),
        sorter.values?.get(rightId),
        sorter.direction
      )

      if (result !== 0) {
        return result
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

const resolveSearchScope = (
  search: NonNullable<QueryPlan['search']>,
  index: SearchIndex
): {
  key: string
  revisionKey: string
  sources: readonly SearchFieldIndex[]
} => {
  const fieldIds = search.fieldIds.length
    ? search.fieldIds
    : Array.from(index.fields.keys())
  const sources: SearchFieldIndex[] = []

  for (let indexOfField = 0; indexOfField < fieldIds.length; indexOfField += 1) {
    const fieldId = fieldIds[indexOfField]!
    const source = index.fields.get(fieldId)
    if (source) {
      sources.push(source)
    }
  }

  return {
    key: fieldIds.length
      ? fieldIds.join(SEARCH_SOURCE_SEPARATOR)
      : 'none',
    revisionKey: sources.length
      ? sources.map(source => `${source.fieldId}:${source.rev}`).join(SEARCH_SOURCE_SEPARATOR)
      : '',
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
  source: SearchFieldIndex
  query: string
  allRecordIds: readonly RecordId[]
  recordOrder: ReadonlyMap<RecordId, number>
}): readonly RecordId[] | undefined => {
  const grams = collectSearchGrams(input.query)
  if (!grams.length) {
    return undefined
  }

  const postings = input.query.length >= 3
    ? input.source.grams3
    : input.source.grams2
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
  source: SearchFieldIndex,
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
  sources: readonly SearchFieldIndex[]
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
  search: NonNullable<QueryPlan['search']>
  index: SearchIndex
  allRecordIds: readonly RecordId[]
  recordOrder: ReadonlyMap<RecordId, number>
  previous?: QueryState
}): SearchMatches | undefined => {
  const query = trimLowercase(input.search.query)
  if (!query) {
    return undefined
  }

  const scope = resolveSearchScope(input.search, input.index)
  if (!scope.sources.length) {
    return {
      query,
      sourceKey: scope.key,
      sourceRevisionKey: scope.revisionKey,
      sources: scope.sources,
      matched: EMPTY_RECORD_IDS
    }
  }

  const previousSearch = input.previous?.search
  if (
    previousSearch
    && previousSearch.sourceKey === scope.key
    && previousSearch.sourceRevisionKey === scope.revisionKey
    && query.startsWith(previousSearch.query)
  ) {
    return {
      query,
      sourceKey: scope.key,
      sourceRevisionKey: scope.revisionKey,
      sources: scope.sources,
      matched: filterExactSearchCandidates({
        ids: previousSearch.matched,
        query,
        sources: scope.sources
      })
    }
  }

  return {
    query,
    sourceKey: scope.key,
    sourceRevisionKey: scope.revisionKey,
    sources: scope.sources,
    matched: (() => {
      const exactCandidateLists: RecordId[][] = []

      if (query.length < 2) {
        for (let index = 0; index < scope.sources.length; index += 1) {
          const candidates = resolveExactSearchCandidatesForSource(scope.sources[index]!, query)
          if (candidates.length) {
            exactCandidateLists.push(candidates as RecordId[])
          }
        }

        return exactCandidateLists.length
          ? unionCandidates(exactCandidateLists, input.allRecordIds, input.recordOrder)
          : EMPTY_RECORD_IDS
      }

      const candidateLists: RecordId[][] = []
      for (let index = 0; index < scope.sources.length; index += 1) {
        const candidates = resolveIndexedSearchCandidatesForSource({
          source: scope.sources[index]!,
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
        sources: scope.sources
      })
    })()
  }
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
      filterApi.rule.match(
        field,
        fieldId === 'title'
          ? row.title
          : row.values[fieldId],
        rule
      )
    ))
  }

  return input.rules.every(({ fieldId, field, rule }) => (
    filterApi.rule.match(
      field,
      fieldId === 'title'
        ? row.title
        : row.values[fieldId],
      rule
    )
  ))
}

const resolveBucketFilterCandidates = (input: {
  field: Field | undefined
  fieldId: string
  rule: View['filter']['rules'][number]
  index: IndexState
}): FilterCandidate | undefined => {
  const lookup = filterApi.rule.bucketLookup(input.field, input.rule)
  if (!lookup) {
    return undefined
  }

  const bucketIndex = readBucketIndex(input.index.bucket, createBucketSpec({
    field: input.fieldId
  }))
  if (!bucketIndex) {
    return undefined
  }

  const readBucketIds = (keys: readonly string[]) => {
    if (!keys.length) {
      return EMPTY_RECORD_IDS
    }

    if (keys.length === 1) {
      return bucketIndex.recordsByKey.get(keys[0]!) ?? EMPTY_RECORD_IDS
    }

    return unionCandidates(
      keys.map(key => bucketIndex.recordsByKey.get(key) ?? EMPTY_RECORD_IDS),
      input.index.records.ids,
      input.index.records.order
    )
  }
  const readRemainingBucketIds = (excludedKeys: ReadonlySet<string>) => (
    excludedKeys.size === 0
      ? input.index.records.ids
      : excludedKeys.size >= bucketIndex.recordsByKey.size
        ? EMPTY_RECORD_IDS
        :
    unionCandidates(
      Array.from(bucketIndex.recordsByKey.entries())
        .flatMap(([key, ids]) => excludedKeys.has(key) ? [] : [ids]),
      input.index.records.ids,
      input.index.records.order
    )
  )

  return {
    ids: lookup.mode === 'include'
      ? readBucketIds(lookup.keys)
      : readRemainingBucketIds(new Set(lookup.keys)),
    exact: true
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
  const sortIndex = input.index.sort.fields.get(input.fieldId)
  if (!sortIndex) {
    return undefined
  }

  const lookup = filterApi.rule.sortLookup(input.field, input.rule)
  if (!lookup) {
    return undefined
  }

  if (lookup.mode === 'exists') {
    return {
      ids: sortIdsByRecordOrder(
        input.index.records.values.get(input.fieldId)?.ids ?? [],
        input.index.records.ids,
        input.index.records.order
      ),
      exact: true
    }
  }

  const expected = lookup.value
  const values = input.index.records.values.get(input.fieldId)?.byRecord ?? EMPTY_VALUE_MAP
  const compare = (recordId: RecordId) => fieldApi.compare.value(
    input.field,
    values.get(recordId),
    expected
  )

  switch (lookup.mode) {
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
  resolveBucketFilterCandidates({
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
  plan: Pick<QueryState['plan'], 'executionKey' | 'watch'>
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
    plan: (
      previous
      && previous.plan.executionKey === input.plan.executionKey
      && (
        previous.plan.watch.search === input.plan.watch.search
        || (
          previous.plan.watch.search !== 'all'
          && input.plan.watch.search !== 'all'
          && sameOrder(previous.plan.watch.search, input.plan.watch.search)
        )
      )
      && sameOrder(previous.plan.watch.filter, input.plan.watch.filter)
      && sameOrder(previous.plan.watch.sort, input.plan.watch.sort)
        ? previous.plan
        : input.plan
    ),
    records: nextRecords,
    ...(input.search
        ? {
            search: previous?.search
            && previous.search.query === input.search.query
            && previous.search.sourceKey === input.search.sourceKey
            && previous.search.sourceRevisionKey === input.search.sourceRevisionKey
            && sameOrder(previous.search.matched, input.search.matched)
              ? previous.search
              : {
                  query: input.search.query,
                  sourceKey: input.search.sourceKey,
                  sourceRevisionKey: input.search.sourceRevisionKey,
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
  plan: QueryPlan
  previous?: QueryState
}): QueryState => {
  if (
    !input.plan.search
    && input.plan.filters.length === 0
  ) {
    const matched = sortRecordIds({
      ids: input.index.records.ids,
      reader: input.reader,
      index: input.index,
      view: input.view
    })
    const ordered = applyViewOrders(matched, input.view, input.reader)

    return publishQueryState({
      plan: {
        executionKey: input.plan.executionKey,
        watch: input.plan.watch
      },
      previous: input.previous,
      matched,
      ordered,
      visible: ordered
    })
  }

  const searchMatches = input.plan.search
    ? resolveSearchMatches({
      search: input.plan.search,
      index: input.index.search,
      allRecordIds: input.index.records.ids,
      recordOrder: input.index.records.order,
      previous: input.previous
    })
    : undefined
  const filterPlans = resolveFilterPlans({
    rules: input.plan.filters,
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
  const hasFilter = input.plan.filters.length > 0
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
    plan: {
      executionKey: input.plan.executionKey,
      watch: input.plan.watch
    },
    previous: input.previous,
    matched,
    ordered,
    visible,
    search: searchMatches
  })
}
