import type {
  Field,
  ViewGroup,
  ViewGroupBucketId
} from '@dataview/core/types'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  normalizeOptionIds
} from '@dataview/core/field/option'

export type GroupWriteResult =
  | { kind: 'set'; value: unknown }
  | { kind: 'clear' }
  | { kind: 'invalid' }

const isEmptyBucket = (
  bucketId: ViewGroupBucketId
) => bucketId === KANBAN_EMPTY_BUCKET_KEY

const parseNumberRangeKey = (
  bucketId: ViewGroupBucketId
): {
  start: number
  interval: number
} | undefined => {
  const match = /^range:([^:]+):([^:]+)$/.exec(bucketId)
  if (!match) {
    return undefined
  }

  const start = Number(match[1])
  const interval = Number(match[2])
  return Number.isFinite(start) && Number.isFinite(interval) && interval > 0
    ? {
        start,
        interval
      }
    : undefined
}

const removeOptionId = (
  ids: readonly string[],
  optionId: string
) => ids.filter(id => id !== optionId)

const appendOptionId = (
  ids: readonly string[],
  optionId: string
) => ids.includes(optionId)
  ? [...ids]
  : [...ids, optionId]

const nextTextValue = (
  bucketId: ViewGroupBucketId
): GroupWriteResult => (
  isEmptyBucket(bucketId)
    ? { kind: 'clear' }
    : { kind: 'set', value: bucketId }
)

const nextNumberValue = (
  bucketId: ViewGroupBucketId
): GroupWriteResult => {
  if (isEmptyBucket(bucketId)) {
    return { kind: 'clear' }
  }

  const range = parseNumberRangeKey(bucketId)
  return range
    ? { kind: 'set', value: range.start }
    : { kind: 'invalid' }
}

const nextSelectValue = (
  field: Extract<Field, { kind: 'select' }>,
  bucketId: ViewGroupBucketId
): GroupWriteResult => {
  if (isEmptyBucket(bucketId)) {
    return { kind: 'clear' }
  }

  return fieldApi.option.read.get(field, bucketId)
    ? { kind: 'set', value: bucketId }
    : { kind: 'invalid' }
}

const nextStatusValue = (
  field: Extract<Field, { kind: 'status' }>,
  mode: string,
  bucketId: ViewGroupBucketId
): GroupWriteResult => {
  if (isEmptyBucket(bucketId)) {
    return { kind: 'clear' }
  }

  if (mode === 'category') {
    const category = bucketId as typeof fieldApi.status.categories[number]
    if (!fieldApi.status.categories.includes(category)) {
      return { kind: 'invalid' }
    }

    const option = fieldApi.status.defaultOption.get(field, category)
    return option
      ? { kind: 'set', value: option.id }
      : { kind: 'invalid' }
  }

  return fieldApi.option.read.get(field, bucketId)
    ? { kind: 'set', value: bucketId }
    : { kind: 'invalid' }
}

const nextBooleanValue = (
  bucketId: ViewGroupBucketId
): GroupWriteResult => {
  if (isEmptyBucket(bucketId)) {
    return { kind: 'clear' }
  }

  if (bucketId === 'true') {
    return { kind: 'set', value: true }
  }

  if (bucketId === 'false') {
    return { kind: 'set', value: false }
  }

  return { kind: 'invalid' }
}

const nextDateValue = (input: {
  field: Extract<Field, { kind: 'date' }>
  bucketId: ViewGroupBucketId
  currentValue: unknown
}): GroupWriteResult => {
  if (isEmptyBucket(input.bucketId)) {
    return { kind: 'clear' }
  }

  const parsed = fieldApi.date.group.parseKey(input.bucketId)
  if (!parsed) {
    return { kind: 'invalid' }
  }

  const next = fieldApi.date.group.createValue(
    input.field,
    parsed.start,
    input.currentValue
  )

  return next
    ? { kind: 'set', value: next }
    : { kind: 'invalid' }
}

const nextMultiSelectValue = (input: {
  bucketId: ViewGroupBucketId
  currentValue: unknown
  fromBucketId?: ViewGroupBucketId
}): GroupWriteResult => {
  let next = normalizeOptionIds(input.currentValue)

  if (input.fromBucketId && !isEmptyBucket(input.fromBucketId)) {
    next = removeOptionId(next, input.fromBucketId)
  }

  if (!isEmptyBucket(input.bucketId)) {
    next = appendOptionId(next, input.bucketId)
  }

  return next.length
    ? { kind: 'set', value: next }
    : { kind: 'clear' }
}

const nextPresenceValue = (
  bucketId: ViewGroupBucketId
): GroupWriteResult => (
  isEmptyBucket(bucketId)
    ? { kind: 'clear' }
    : { kind: 'invalid' }
)

export const groupWriteValue = (input: {
  field: Field | undefined
  group: Pick<ViewGroup, 'mode'> | undefined
  currentValue: unknown
  fromBucketId?: ViewGroupBucketId
  bucketId: ViewGroupBucketId
}): GroupWriteResult => {
  if (!input.field || !input.group) {
    return { kind: 'invalid' }
  }

  switch (input.field.kind) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return nextTextValue(input.bucketId)
    case 'number':
      return nextNumberValue(input.bucketId)
    case 'date':
      return nextDateValue({
        field: input.field,
        bucketId: input.bucketId,
        currentValue: input.currentValue
      })
    case 'select':
      return nextSelectValue(input.field, input.bucketId)
    case 'status':
      return nextStatusValue(input.field, input.group.mode, input.bucketId)
    case 'boolean':
      return nextBooleanValue(input.bucketId)
    case 'multiSelect':
      return nextMultiSelectValue({
        bucketId: input.bucketId,
        currentValue: input.currentValue,
        fromBucketId: input.fromBucketId
      })
    case 'asset':
      return nextPresenceValue(input.bucketId)
    default:
      return { kind: 'invalid' }
  }
}

export const group = {
  write: {
    value: groupWriteValue
  }
} as const
