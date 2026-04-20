import type {
  BucketState,
  Field,
  ViewGroup
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'

export type ViewGroupPatch = Pick<ViewGroup, 'mode' | 'bucketSort' | 'bucketInterval' | 'showEmpty'>

const hasOwn = <T extends object>(
  value: T | undefined,
  key: PropertyKey
) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key))

const cloneBucketState = (
  state: BucketState
): BucketState => ({
  ...(state.hidden === true ? { hidden: true } : {}),
  ...(state.collapsed === true ? { collapsed: true } : {})
})

const normalizeBucketState = (
  state: BucketState | undefined
): BucketState | undefined => {
  if (!state) {
    return undefined
  }

  const next = cloneBucketState(state)
  return Object.keys(next).length
    ? next
    : undefined
}

const cloneBuckets = (
  buckets: Readonly<Record<string, BucketState>> | undefined
): Readonly<Record<string, BucketState>> | undefined => {
  if (!buckets) {
    return undefined
  }

  const entries = Object.entries(buckets)
    .flatMap(([key, state]) => {
      const next = normalizeBucketState(state)
      return next
        ? [[key, next] as const]
        : []
    })

  return entries.length
    ? Object.fromEntries(entries)
    : undefined
}

export const cloneGroupState = (
  group: ViewGroup | undefined
): ViewGroup | undefined => (
  group
    ? (() => {
        const buckets = cloneBuckets(group.buckets)
        return {
          field: group.field,
          mode: group.mode,
          bucketSort: group.bucketSort,
          ...(group.bucketInterval !== undefined
            ? { bucketInterval: group.bucketInterval }
            : {}),
          ...(group.showEmpty !== undefined
            ? { showEmpty: group.showEmpty }
            : {}),
          ...(buckets
            ? { buckets }
            : {})
        }
      })()
    : undefined
)

export const sameGroupState = (
  left: ViewGroup | undefined,
  right: ViewGroup | undefined
) => (
  left?.field === right?.field
  && left?.mode === right?.mode
  && left?.bucketSort === right?.bucketSort
  && left?.bucketInterval === right?.bucketInterval
  && left?.showEmpty === right?.showEmpty
  && sameBuckets(left?.buckets, right?.buckets)
)

export const normalizeGroupState = (
  group: unknown
): ViewGroup | undefined => {
  const source = typeof group === 'object' && group !== null
    ? group as {
        field?: unknown
        mode?: unknown
        bucketSort?: unknown
        bucketInterval?: unknown
        showEmpty?: unknown
        buckets?: unknown
      }
    : undefined
  if (!source || typeof source.field !== 'string') {
    return undefined
  }

  const buckets = normalizeBuckets(source.buckets)
  return {
    field: source.field,
    mode: typeof source.mode === 'string'
      ? source.mode
      : '',
    bucketSort: normalizeBucketSort(source.bucketSort),
    ...(typeof source.bucketInterval === 'number'
      ? { bucketInterval: source.bucketInterval }
      : {}),
    ...(typeof source.showEmpty === 'boolean'
      ? { showEmpty: source.showEmpty }
      : {}),
    ...(buckets
      ? { buckets }
      : {})
  }
}

const normalizeBucketSort = (
  value: unknown
): ViewGroup['bucketSort'] => (
  typeof value === 'string'
    ? value as ViewGroup['bucketSort']
    : 'manual'
)

const normalizeBuckets = (
  value: unknown
): Readonly<Record<string, BucketState>> | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const entries = Object.entries(value)
    .flatMap(([key, state]) => {
      const normalizedKey = typeof key === 'string'
        ? key.trim()
        : ''
      const normalizedState = normalizeBucketState(
        typeof state === 'object' && state !== null
          ? state as BucketState
          : undefined
      )

      return normalizedKey && normalizedState
        ? [[normalizedKey, normalizedState] as const]
        : []
    })

  return entries.length
    ? Object.fromEntries(entries)
    : undefined
}

const buildGroup = (input: {
  field: Field
  patch?: Partial<ViewGroupPatch> & Pick<ViewGroup, 'showEmpty' | 'buckets'>
}): ViewGroup => {
  const meta = fieldApi.group.meta(input.field, input.patch)
  const buckets = cloneBuckets(input.patch?.buckets)

  return {
    field: input.field.id,
    mode: meta.mode,
    bucketSort: meta.sort || 'manual',
    ...(meta.bucketInterval !== undefined
      ? { bucketInterval: meta.bucketInterval }
      : {}),
    ...(meta.showEmpty !== undefined
      ? { showEmpty: meta.showEmpty }
      : {}),
    ...(buckets
      ? { buckets }
      : {})
  }
}

const patchBuckets = (
  buckets: Readonly<Record<string, BucketState>> | undefined,
  key: string,
  patch: BucketState
): Readonly<Record<string, BucketState>> | undefined => {
  const current = normalizeBucketState(buckets?.[key])
  const nextState = normalizeBucketState({
    ...current,
    ...patch
  })
  const next = {
    ...(buckets ?? {})
  }

  if (nextState) {
    next[key] = nextState
  } else {
    delete next[key]
  }

  return cloneBuckets(next)
}

export const patchGroupState = (
  group: ViewGroup | undefined,
  field: Field,
  patch?: Partial<ViewGroupPatch> & Pick<ViewGroup, 'showEmpty' | 'buckets'>
): ViewGroup | undefined => {
  const meta = fieldApi.group.meta(field)
  if (!meta.modes.length || !meta.sorts.length) {
    return group
  }

  const nextMode = hasOwn(patch, 'mode')
    ? patch!.mode
    : group?.mode
  const nextBucketSort = hasOwn(patch, 'bucketSort')
    ? patch!.bucketSort
    : group?.bucketSort
  const nextBucketInterval = hasOwn(patch, 'bucketInterval')
    ? patch!.bucketInterval
    : group?.bucketInterval
  const nextShowEmpty = hasOwn(patch, 'showEmpty')
    ? patch!.showEmpty
    : group?.showEmpty
  const buckets = (
    group?.field === field.id
    && group.mode === nextMode
    && group.bucketInterval === nextBucketInterval
  )
    ? (hasOwn(patch, 'buckets')
        ? patch!.buckets
        : group?.buckets)
    : undefined

  return buildGroup({
    field,
    patch: {
      mode: nextMode,
      bucketSort: nextBucketSort,
      bucketInterval: nextBucketInterval,
      showEmpty: nextShowEmpty,
      buckets
    }
  })
}

export const clear = (
  group: ViewGroup | undefined
): ViewGroup | undefined => (
  group
    ? undefined
    : group
)

export const set = (
  group: ViewGroup | undefined,
  field: Field
): ViewGroup | undefined => {
  const meta = fieldApi.group.meta(field)
  if (!meta.modes.length || !meta.sorts.length) {
    return group
  }

  const nextGroup = buildGroup({
    field
  })

  return sameGroupState(group, nextGroup)
    ? group
    : nextGroup
}

export const toggle = (
  group: ViewGroup | undefined,
  field: Field
): ViewGroup | undefined => (
  group?.field === field.id
    ? clear(group)
    : set(group, field)
)

export const patch = (
  group: ViewGroup | undefined,
  field: Field,
  patch: Partial<ViewGroupPatch>
): ViewGroup | undefined => {
  const nextGroup = patchGroupState(group, field, patch)
  return sameGroupState(group, nextGroup)
    ? group
    : nextGroup
}

export const patchBucket = (
  group: ViewGroup | undefined,
  field: Field,
  key: string,
  patch: BucketState
): ViewGroup | undefined => {
  if (group?.field !== field.id) {
    return group
  }

  const nextGroup = patchGroupState(group, field, {
    buckets: patchBuckets(group.buckets, key, patch)
  })
  return sameGroupState(group, nextGroup)
    ? group
    : nextGroup
}

export const toggleGroupBucketCollapsed = (
  group: ViewGroup | undefined,
  field: Field,
  key: string
): ViewGroup | undefined => {
  if (group?.field !== field.id) {
    return group
  }

  return patchBucket(
    group,
    field,
    key,
    {
      collapsed: group.buckets?.[key]?.collapsed !== true
    }
  )
}

const sameBucketState = (
  left: BucketState | undefined,
  right: BucketState | undefined
) => (
  (left?.hidden === true) === (right?.hidden === true)
  && (left?.collapsed === true) === (right?.collapsed === true)
)

const sameBuckets = (
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

  return leftEntries.every(([key, state]) => sameBucketState(state, right?.[key]))
}
