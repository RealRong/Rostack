import type {
  Field,
  FilterRule
} from '@dataview/core/contracts'
import {
  filter as filterApi
} from '@dataview/core/filter'

export type FilterCandidateLookupPlan =
  | {
      kind: 'bucket'
      mode: 'include' | 'exclude'
      keys: readonly string[]
      exact: true
    }
  | {
      kind: 'sort'
      mode: 'exists' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte'
      value?: unknown
      exact: true
    }
  | {
      kind: 'scan'
      exact: false
    }

export const planFilterCandidateLookup = (input: {
  field: Field | undefined
  rule: FilterRule
}): FilterCandidateLookupPlan => {
  const bucketLookup = filterApi.rule.bucketLookup(input.field, input.rule)
  if (bucketLookup) {
    return {
      kind: 'bucket',
      mode: bucketLookup.mode,
      keys: bucketLookup.keys,
      exact: true
    }
  }

  const sortLookup = filterApi.rule.sortLookup(input.field, input.rule)
  if (sortLookup) {
    return {
      kind: 'sort',
      mode: sortLookup.mode,
      ...(sortLookup.mode === 'exists'
        ? {}
        : {
            value: sortLookup.value
          }),
      exact: true
    }
  }

  return {
    kind: 'scan',
    exact: false
  }
}
