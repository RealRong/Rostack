import type { RecordId } from '@dataview/core/types'
import { string } from '@shared/core'
import type {
  QueryPlan
} from '@dataview/engine/active/plan'
import type {
  SearchFieldIndex,
  SearchIndex
} from '@dataview/engine/active/index/contracts'
import type {
  QueryPhaseState as QueryState
} from '@dataview/engine/active/state'
import {
  intersectCandidates,
  unionCandidates
} from '@dataview/engine/active/query/candidateSet'

export type SearchMatches = {
  query: string
  sourceKey: string
  sourceRevisionKey: string
  sources: readonly SearchFieldIndex[]
  matched: readonly RecordId[]
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_SEARCH_SOURCES = [] as readonly SearchFieldIndex[]
const EMPTY_SEARCH_GRAMS = [] as readonly string[]
const SEARCH_SOURCE_SEPARATOR = '\u0000'

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
  let candidates: readonly RecordId[] | undefined

  for (let index = 0; index < grams.length; index += 1) {
    const ids = postings.get(grams[index]!)
    if (!ids?.length) {
      return EMPTY_RECORD_IDS
    }

    candidates = candidates
      ? intersectCandidates(
          candidates,
          ids,
          input.allRecordIds,
          input.recordOrder
        )
      : ids
  }

  return candidates ?? EMPTY_RECORD_IDS
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

export const resolveSearchMatches = (input: {
  search: NonNullable<QueryPlan['search']>
  index: SearchIndex
  allRecordIds: readonly RecordId[]
  recordOrder: ReadonlyMap<RecordId, number>
  previous?: QueryState
}): SearchMatches | undefined => {
  const query = string.trimLowercase(input.search.query)
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

  const exactCandidateLists: RecordId[][] = []
  if (query.length < 2) {
    for (let index = 0; index < scope.sources.length; index += 1) {
      const candidates = resolveExactSearchCandidatesForSource(scope.sources[index]!, query)
      if (candidates.length) {
        exactCandidateLists.push(candidates as RecordId[])
      }
    }

    return {
      query,
      sourceKey: scope.key,
      sourceRevisionKey: scope.revisionKey,
      sources: scope.sources,
      matched: exactCandidateLists.length
        ? unionCandidates(exactCandidateLists, input.allRecordIds, input.recordOrder)
        : EMPTY_RECORD_IDS
    }
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

  return {
    query,
    sourceKey: scope.key,
    sourceRevisionKey: scope.revisionKey,
    sources: scope.sources,
    matched: filterExactSearchCandidates({
      ids: candidatePool,
      query,
      sources: scope.sources
    })
  }
}
