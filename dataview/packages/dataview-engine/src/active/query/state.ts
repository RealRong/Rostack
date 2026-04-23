import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  QueryPlan
} from '@dataview/engine/active/plan'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import {
  filterVisibleIds,
  resolveFilterCandidates,
  resolveFilterPlans,
  resolveFilterPredicateRules
} from '@dataview/engine/active/query/filterCandidates'
import {
  intersectCandidates,
  projectCandidatesToOrderedIds,
  resolveQueryOrderState,
  type QueryReuseState
} from '@dataview/engine/active/query/order'
import {
  resolveSearchMatches,
  type SearchMatches
} from '@dataview/engine/active/query/search'
import type {
  QueryPhaseState as QueryState
} from '@dataview/engine/active/state'
import {
  createSelectionFromIds
} from '@dataview/engine/active/shared/selection'
import {
  type DocumentReader
} from '@dataview/engine/document/reader'

const createPublishedSelection = (input: {
  previous?: QueryState['matched']
  index: IndexState
  ids: readonly RecordId[]
}) => {
  if (
    input.previous
    && input.previous.rows === input.index.rows
    && input.previous.ids === input.ids
  ) {
    return input.previous
  }

  return createSelectionFromIds({
    rows: input.index.rows,
    ids: input.ids,
    previous: input.previous
  })
}

const publishQueryState = (input: {
  previous?: QueryState
  index: IndexState
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
  search?: SearchMatches
}): QueryState => {
  const previous = input.previous
  const previousMatchedIds = previous?.matched.read.ids()
  const previousOrderedIds = previous?.ordered.read.ids()
  const previousVisibleIds = previous?.visible.read.ids()
  const nextMatched = previousMatchedIds && equal.sameOrder(previousMatchedIds, input.matched)
    ? previousMatchedIds
    : input.matched
  const nextOrdered = previousOrderedIds && equal.sameOrder(previousOrderedIds, input.ordered)
    ? previousOrderedIds
    : input.ordered
  const nextVisible = previousVisibleIds && equal.sameOrder(previousVisibleIds, input.visible)
    ? previousVisibleIds
    : input.visible

  return {
    matched: createPublishedSelection({
      previous: previous?.matched,
      index: input.index,
      ids: nextMatched
    }),
    ordered: createPublishedSelection({
      previous: previous?.ordered,
      index: input.index,
      ids: nextOrdered
    }),
    visible: createPublishedSelection({
      previous: previous?.visible,
      index: input.index,
      ids: nextVisible
    }),
    ...(input.search
      ? {
          search: previous?.search
          && previous.search.query === input.search.query
          && previous.search.sourceKey === input.search.sourceKey
          && previous.search.sourceRevisionKey === input.search.sourceRevisionKey
          && equal.sameOrder(previous.search.matched, input.search.matched)
            ? previous.search
            : {
                query: input.search.query,
                sourceKey: input.search.sourceKey,
                sourceRevisionKey: input.search.sourceRevisionKey,
                matched: input.search.matched
              }
        }
      : {})
  }
}

export const buildQueryState = (input: {
  reader: DocumentReader
  view: View
  index: IndexState
  plan: QueryPlan
  previous?: QueryState
  reuse?: QueryReuseState
}): QueryState => {
  if (
    !input.plan.search
    && input.plan.filters.length === 0
  ) {
    const {
      matched,
      ordered
    } = resolveQueryOrderState(input)

    return publishQueryState({
      previous: input.previous,
      index: input.index,
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

  const {
    matched,
    ordered
  } = resolveQueryOrderState(input)
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
    index: input.index,
    matched,
    ordered,
    visible,
    search: searchMatches
  })
}
