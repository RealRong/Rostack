import type {
  BucketState,
  GroupProperty,
  GroupGroupBy
} from '@/core/contracts'
import {
  getPropertyGroupMeta
} from '@/core/property'
import type {
  GroupViewQuery,
  ResolvedViewGroupState,
  ViewGroupPatch
} from './contracts'
import {
  cloneBuckets,
  cloneViewQuery,
  sameGroup
} from './shared'

type GroupableProperty = Pick<GroupProperty, 'id' | 'kind' | 'config'>

const findProperty = (
  properties: readonly GroupProperty[],
  propertyId: string
) => properties.find(property => property.id === propertyId)

const normalizeBucketState = (
  state: BucketState | undefined
): BucketState | undefined => {
  if (!state) {
    return undefined
  }

  const next: BucketState = {
    ...(state.hidden === true ? { hidden: true } : {}),
    ...(state.collapsed === true ? { collapsed: true } : {})
  }

  return Object.keys(next).length
    ? next
    : undefined
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

const buildStoredGroup = (input: {
  property: GroupableProperty
  patch?: Partial<ViewGroupPatch> & Pick<GroupGroupBy, 'showEmpty' | 'buckets'>
}): GroupGroupBy => {
  const normalized = getPropertyGroupMeta(
    input.property,
    input.patch
  )
  const buckets = cloneBuckets(input.patch?.buckets)

  return {
    property: input.property.id,
    mode: normalized.mode,
    bucketSort: normalized.sort || 'manual',
    ...(normalized.bucketInterval !== undefined
      ? { bucketInterval: normalized.bucketInterval }
      : {}),
    ...(normalized.showEmpty !== undefined
      ? { showEmpty: normalized.showEmpty }
      : {}),
    ...(buckets
      ? { buckets }
      : {})
  }
}

const patchViewGroup = (
  query: GroupViewQuery,
  property: GroupableProperty,
  patch?: Partial<ViewGroupPatch> & Pick<GroupGroupBy, 'showEmpty' | 'buckets'>
): GroupViewQuery => {
  const currentMeta = getPropertyGroupMeta(property)
  if (!currentMeta.modes.length || !currentMeta.sorts.length) {
    return query
  }

  const currentGroup = query.group
  const nextMode = patch?.mode ?? currentGroup?.mode
  const nextBucketInterval = patch?.bucketInterval ?? currentGroup?.bucketInterval
  const buckets = (
    currentGroup?.property === property.id
    && currentGroup?.mode === nextMode
    && currentGroup?.bucketInterval === nextBucketInterval
  )
    ? (patch?.buckets ?? currentGroup?.buckets)
    : undefined

  const nextGroup = buildStoredGroup({
    property,
    patch: {
      mode: nextMode,
      bucketSort: patch?.bucketSort ?? currentGroup?.bucketSort,
      bucketInterval: nextBucketInterval,
      showEmpty: patch?.showEmpty ?? currentGroup?.showEmpty,
      buckets
    }
  })

  if (sameGroup(query.group, nextGroup)) {
    return query
  }

  const next = cloneViewQuery(query)
  next.group = nextGroup
  return next
}

const resolveGroupProperty = (
  query: GroupViewQuery,
  property: GroupableProperty
) => (
  query.group?.property === property.id
    ? property
    : undefined
)

export const resolveViewGroupState = (
  properties: readonly GroupProperty[],
  group: GroupGroupBy | undefined
): ResolvedViewGroupState => {
  const propertyId = typeof group?.property === 'string'
    ? group.property
    : ''
  const property = propertyId
    ? findProperty(properties, propertyId)
    : undefined

  if (!property) {
    return {
      property: undefined,
      propertyId: '',
      mode: '',
      bucketSort: undefined,
      showEmpty: undefined
    }
  }

  return {
    property,
    propertyId: property.id,
    mode: group?.mode ?? '',
    bucketSort: group?.bucketSort,
    bucketInterval: group?.bucketInterval,
    showEmpty: group?.showEmpty
  }
}

export const setViewGroup = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>
): GroupViewQuery => {
  const groupMeta = getPropertyGroupMeta(property)
  if (!groupMeta.modes.length || !groupMeta.sorts.length) {
    return query
  }

  const nextGroup = buildStoredGroup({
    property
  })

  if (sameGroup(query.group, nextGroup)) {
    return query
  }

  const next = cloneViewQuery(query)
  next.group = nextGroup
  return next
}

export const clearViewGroup = (
  query: GroupViewQuery
): GroupViewQuery => {
  if (!query.group) {
    return query
  }

  const next = cloneViewQuery(query)
  next.group = undefined
  return next
}

export const toggleViewGroup = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>
): GroupViewQuery => (
  query.group?.property === property.id
    ? clearViewGroup(query)
    : setViewGroup(query, property)
)

export const setViewGroupMode = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>,
  mode: string
): GroupViewQuery => patchViewGroup(query, property, { mode })

export const setViewGroupBucketSort = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>,
  bucketSort: GroupGroupBy['bucketSort']
): GroupViewQuery => patchViewGroup(query, property, { bucketSort })

export const setViewGroupBucketInterval = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>,
  bucketInterval: GroupGroupBy['bucketInterval']
): GroupViewQuery => patchViewGroup(query, property, { bucketInterval })

export const setViewGroupShowEmpty = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>,
  showEmpty: boolean
): GroupViewQuery => patchViewGroup(query, property, { showEmpty })

export const setViewGroupBucketHidden = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>,
  key: string,
  hidden: boolean
): GroupViewQuery => {
  const activeProperty = resolveGroupProperty(query, property)
  if (!activeProperty) {
    return query
  }

  return patchViewGroup(query, property, {
    buckets: patchBuckets(query.group?.buckets, key, {
      hidden
    })
  })
}

export const setViewGroupBucketCollapsed = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>,
  key: string,
  collapsed: boolean
): GroupViewQuery => {
  const activeProperty = resolveGroupProperty(query, property)
  if (!activeProperty) {
    return query
  }

  return patchViewGroup(query, property, {
    buckets: patchBuckets(query.group?.buckets, key, {
      collapsed
    })
  })
}

export const toggleViewGroupBucketCollapsed = (
  query: GroupViewQuery,
  property: Pick<GroupProperty, 'id' | 'kind' | 'config'>,
  key: string
): GroupViewQuery => setViewGroupBucketCollapsed(
  query,
  property,
  key,
  query.group?.buckets?.[key]?.collapsed !== true
)
