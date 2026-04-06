import type {
  BucketState,
  Field,
  Grouping
} from '@dataview/core/contracts'
import {
  getFieldGroupMeta
} from '@dataview/core/field'
import type {
  ViewQuery,
  ResolvedViewGroupState,
  ViewGroupPatch
} from './contracts'
import {
  cloneBuckets,
  cloneViewQuery,
  sameGroup
} from './shared'

type GroupableField = Field

const findProperty = (
  fields: readonly Field[],
  fieldId: string
) => fields.find(field => field.id === fieldId)

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
  field: GroupableField
  patch?: Partial<ViewGroupPatch> & Pick<Grouping, 'showEmpty' | 'buckets'>
}): Grouping => {
  const normalized = getFieldGroupMeta(
    input.field,
    input.patch
  )
  const buckets = cloneBuckets(input.patch?.buckets)

  return {
    field: input.field.id,
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
  query: ViewQuery,
  field: GroupableField,
  patch?: Partial<ViewGroupPatch> & Pick<Grouping, 'showEmpty' | 'buckets'>
): ViewQuery => {
  const currentMeta = getFieldGroupMeta(field)
  if (!currentMeta.modes.length || !currentMeta.sorts.length) {
    return query
  }

  const currentGroup = query.group
  const nextMode = patch?.mode ?? currentGroup?.mode
  const nextBucketInterval = patch?.bucketInterval ?? currentGroup?.bucketInterval
  const buckets = (
    currentGroup?.field === field.id
    && currentGroup?.mode === nextMode
    && currentGroup?.bucketInterval === nextBucketInterval
  )
    ? (patch?.buckets ?? currentGroup?.buckets)
    : undefined

  const nextGroup = buildStoredGroup({
    field,
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
  query: ViewQuery,
  field: GroupableField
) => (
  query.group?.field === field.id
    ? field
    : undefined
)

export const resolveViewGroupState = (
  fields: readonly Field[],
  group: Grouping | undefined
): ResolvedViewGroupState => {
  const fieldId = typeof group?.field === 'string'
    ? group.field
    : ''
  const field = fieldId
    ? findProperty(fields, fieldId)
    : undefined

  if (!field) {
    return {
      field: undefined,
      fieldId: '',
      mode: '',
      bucketSort: undefined,
      showEmpty: undefined
    }
  }

  return {
    field,
    fieldId: field.id,
    mode: group?.mode ?? '',
    bucketSort: group?.bucketSort,
    bucketInterval: group?.bucketInterval,
    showEmpty: group?.showEmpty
  }
}

export const setViewGroup = (
  query: ViewQuery,
  field: Field
): ViewQuery => {
  const groupMeta = getFieldGroupMeta(field)
  if (!groupMeta.modes.length || !groupMeta.sorts.length) {
    return query
  }

  const nextGroup = buildStoredGroup({
    field
  })

  if (sameGroup(query.group, nextGroup)) {
    return query
  }

  const next = cloneViewQuery(query)
  next.group = nextGroup
  return next
}

export const clearViewGroup = (
  query: ViewQuery
): ViewQuery => {
  if (!query.group) {
    return query
  }

  const next = cloneViewQuery(query)
  next.group = undefined
  return next
}

export const toggleViewGroup = (
  query: ViewQuery,
  field: Field
): ViewQuery => (
  query.group?.field === field.id
    ? clearViewGroup(query)
    : setViewGroup(query, field)
)

export const setViewGroupMode = (
  query: ViewQuery,
  field: Field,
  mode: string
): ViewQuery => patchViewGroup(query, field, { mode })

export const setViewGroupBucketSort = (
  query: ViewQuery,
  field: Field,
  bucketSort: Grouping['bucketSort']
): ViewQuery => patchViewGroup(query, field, { bucketSort })

export const setViewGroupBucketInterval = (
  query: ViewQuery,
  field: Field,
  bucketInterval: Grouping['bucketInterval']
): ViewQuery => patchViewGroup(query, field, { bucketInterval })

export const setViewGroupShowEmpty = (
  query: ViewQuery,
  field: Field,
  showEmpty: boolean
): ViewQuery => patchViewGroup(query, field, { showEmpty })

export const setViewGroupBucketHidden = (
  query: ViewQuery,
  field: Field,
  key: string,
  hidden: boolean
): ViewQuery => {
  const activeProperty = resolveGroupProperty(query, field)
  if (!activeProperty) {
    return query
  }

  return patchViewGroup(query, field, {
    buckets: patchBuckets(query.group?.buckets, key, {
      hidden
    })
  })
}

export const setViewGroupBucketCollapsed = (
  query: ViewQuery,
  field: Field,
  key: string,
  collapsed: boolean
): ViewQuery => {
  const activeProperty = resolveGroupProperty(query, field)
  if (!activeProperty) {
    return query
  }

  return patchViewGroup(query, field, {
    buckets: patchBuckets(query.group?.buckets, key, {
      collapsed
    })
  })
}

export const toggleViewGroupBucketCollapsed = (
  query: ViewQuery,
  field: Field,
  key: string
): ViewQuery => setViewGroupBucketCollapsed(
  query,
  field,
  key,
  query.group?.buckets?.[key]?.collapsed !== true
)
