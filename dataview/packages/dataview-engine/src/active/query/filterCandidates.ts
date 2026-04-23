import type {
  Field,
  FilterRule,
  RecordId,
  View
} from '@dataview/core/contracts'
import { field as fieldApi } from '@dataview/core/field'
import { filter as filterApi } from '@dataview/core/filter'
import type {
  EffectiveFilterRule
} from '@dataview/engine/active/plan'
import {
  createBucketSpec,
  readBucketIndex
} from '@dataview/engine/active/index/bucket'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  intersectCandidates,
  sortIdsByRecordOrder,
  unionCandidates
} from '@dataview/engine/active/query/order'

type FilterCandidate = {
  ids: readonly RecordId[]
  exact: boolean
}

type FilterRulePlan = {
  rule: EffectiveFilterRule
  candidate?: FilterCandidate
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_FILTER_RULES = [] as readonly EffectiveFilterRule[]
const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()

const matchesFilter = (input: {
  recordId: RecordId
  mode: View['filter']['mode']
  rules: readonly EffectiveFilterRule[]
  index: IndexState
}): boolean => {
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
  rule: FilterRule
  index: IndexState
}): FilterCandidate | undefined => {
  const lookup = filterApi.rule.bucketLookup(input.field, input.rule)
  if (!lookup) {
    return undefined
  }

  const bucketIndex = readBucketIndex(input.index.bucket, createBucketSpec({
    fieldId: input.fieldId
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
        : unionCandidates(
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
    const comparison = input.compare(input.ids[middle]!)
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
  rule: FilterRule
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

export const resolveFilterPlans = (input: {
  rules: readonly EffectiveFilterRule[]
  index: IndexState
}): readonly FilterRulePlan[] => input.rules.map(rule => ({
  rule,
  candidate: resolveFilterCandidatesForRule({
    rule,
    index: input.index
  })
}))

export const resolveFilterCandidates = (input: {
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

export const resolveFilterPredicateRules = (input: {
  plans: readonly FilterRulePlan[]
  mode: View['filter']['mode']
}): readonly EffectiveFilterRule[] => {
  if (input.mode === 'or') {
    return input.plans.every(plan => plan.candidate?.exact)
      ? EMPTY_FILTER_RULES
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

export const filterVisibleIds = (input: {
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
