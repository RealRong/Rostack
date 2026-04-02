import type {
  BucketState,
  GroupFilterRule,
  GroupGroupBy,
  GroupSorter
} from '@dataview/core/contracts'
import type { GroupViewQuery } from './contracts'

export const cloneFilterRule = (rule: GroupFilterRule): GroupFilterRule => ({
  property: rule.property,
  op: rule.op,
  value: structuredClone(rule.value)
})

export const cloneSorter = (sorter: GroupSorter): GroupSorter => ({
  property: sorter.property,
  direction: sorter.direction
})

export const cloneBucketState = (state: BucketState): BucketState => ({
  ...(state.hidden === true ? { hidden: true } : {}),
  ...(state.collapsed === true ? { collapsed: true } : {})
})

export const cloneBuckets = (
  buckets: Readonly<Record<string, BucketState>> | undefined
): Readonly<Record<string, BucketState>> | undefined => {
  if (!buckets) {
    return undefined
  }

  const entries = Object.entries(buckets)
    .flatMap(([key, state]) => {
      const next = cloneBucketState(state)
      return Object.keys(next).length
        ? [[key, next] as const]
        : []
    })

  return entries.length
    ? Object.fromEntries(entries)
    : undefined
}

export const cloneGroup = (group: GroupGroupBy | undefined): GroupGroupBy | undefined => (
  group
    ? {
        property: group.property,
        mode: group.mode,
        bucketSort: group.bucketSort,
        ...(group.bucketInterval !== undefined
          ? { bucketInterval: group.bucketInterval }
          : {}),
        ...(group.showEmpty !== undefined
          ? { showEmpty: group.showEmpty }
          : {}),
        ...(cloneBuckets(group.buckets)
          ? { buckets: cloneBuckets(group.buckets)! }
          : {})
      }
    : undefined
)

export const cloneViewQuery = (query: GroupViewQuery): GroupViewQuery => ({
  search: {
    query: query.search.query,
    properties: query.search.properties?.length
      ? [...query.search.properties]
      : undefined
  },
  filter: {
    mode: query.filter.mode,
    rules: query.filter.rules.map(cloneFilterRule)
  },
  sorters: query.sorters.map(cloneSorter),
  group: cloneGroup(query.group)
})

export const sameStringArray = (
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
) => {
  if (!left?.length && !right?.length) {
    return true
  }
  if (!left || !right || left.length !== right.length) {
    return false
  }
  return left.every((value, index) => value === right[index])
}

export const sameFilterRule = (
  left: GroupFilterRule,
  right: GroupFilterRule
) => (
  left.property === right.property
  && left.op === right.op
  && JSON.stringify(left.value) === JSON.stringify(right.value)
)

export const sameGroup = (
  left: GroupGroupBy | undefined,
  right: GroupGroupBy | undefined
) => (
  left?.property === right?.property
  && left?.mode === right?.mode
  && left?.bucketSort === right?.bucketSort
  && left?.bucketInterval === right?.bucketInterval
  && left?.showEmpty === right?.showEmpty
  && sameBuckets(left?.buckets, right?.buckets)
)

const sameBucketState = (
  left: BucketState | undefined,
  right: BucketState | undefined
) => (
  (left?.hidden === true) === (right?.hidden === true)
  && (left?.collapsed === true) === (right?.collapsed === true)
)

export const sameBuckets = (
  left: Readonly<Record<string, BucketState>> | undefined,
  right: Readonly<Record<string, BucketState>> | undefined
) => {
  const leftEntries = Object.entries(left ?? {})
    .filter(([, state]) => state.hidden === true || state.collapsed === true)
  const rightEntries = Object.entries(right ?? {})
    .filter(([, state]) => state.hidden === true || state.collapsed === true)

  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(([key, state]) => (
    sameBucketState(state, right?.[key])
  ))
}
