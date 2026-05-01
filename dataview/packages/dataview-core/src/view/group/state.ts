import type {
  BucketState,
  Field,
  ViewGroup,
  ViewGroupBucketId
} from '@dataview/core/types'
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
  buckets: Readonly<Record<ViewGroupBucketId, BucketState>> | undefined
): Readonly<Record<ViewGroupBucketId, BucketState>> | undefined => {
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
          fieldId: group.fieldId,
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
  left?.fieldId === right?.fieldId
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
        fieldId?: unknown
        mode?: unknown
        bucketSort?: unknown
        bucketInterval?: unknown
        showEmpty?: unknown
        buckets?: unknown
      }
    : undefined
  if (!source || typeof source.fieldId !== 'string') {
    return undefined
  }

  const buckets = normalizeBuckets(source.buckets)
  return {
    fieldId: source.fieldId,
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
): Readonly<Record<ViewGroupBucketId, BucketState>> | undefined => {
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
    fieldId: input.field.id,
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
  buckets: Readonly<Record<ViewGroupBucketId, BucketState>> | undefined,
  bucketId: ViewGroupBucketId,
  patch: BucketState
): Readonly<Record<ViewGroupBucketId, BucketState>> | undefined => {
  const current = normalizeBucketState(buckets?.[bucketId])
  const nextState = normalizeBucketState({
    ...current,
    ...patch
  })
  const next = {
    ...(buckets ?? {})
  }

  if (nextState) {
    next[bucketId] = nextState
  } else {
    delete next[bucketId]
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
    group?.fieldId === field.id
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

export const setGroupState = (
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
  group?.fieldId === field.id
    ? clear(group)
    : setGroupState(group, field)
)

export const updateGroupState = (
  group: ViewGroup | undefined,
  field: Field,
  patch: Partial<ViewGroupPatch>
): ViewGroup | undefined => {
  const nextGroup = patchGroupState(group, field, patch)
  return sameGroupState(group, nextGroup)
    ? group
    : nextGroup
}

export const updateGroupBucketState = (
  group: ViewGroup | undefined,
  field: Field,
  bucketId: ViewGroupBucketId,
  patch: BucketState
): ViewGroup | undefined => {
  if (group?.fieldId !== field.id) {
    return group
  }

  const nextGroup = patchGroupState(group, field, {
    buckets: patchBuckets(group.buckets, bucketId, patch)
  })
  return sameGroupState(group, nextGroup)
    ? group
    : nextGroup
}

export const toggleGroupBucketCollapsed = (
  group: ViewGroup | undefined,
  field: Field,
  bucketId: ViewGroupBucketId
): ViewGroup | undefined => {
  if (group?.fieldId !== field.id) {
    return group
  }

  return updateGroupBucketState(
    group,
    field,
    bucketId,
    {
      collapsed: group.buckets?.[bucketId]?.collapsed !== true
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
  left: Readonly<Record<ViewGroupBucketId, BucketState>> | undefined,
  right: Readonly<Record<ViewGroupBucketId, BucketState>> | undefined
) => {
  const leftEntries = Object.entries(left ?? {})
    .filter(([, state]) => state.hidden === true || state.collapsed === true)
  const rightEntries = Object.entries(right ?? {})
    .filter(([, state]) => state.hidden === true || state.collapsed === true)

  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(([bucketId, state]) => sameBucketState(state, right?.[bucketId as ViewGroupBucketId]))
}
