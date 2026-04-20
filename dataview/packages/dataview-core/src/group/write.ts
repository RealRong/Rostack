import type {
  Field,
  ViewGroup
} from '@dataview/core/contracts'
import {
  KANBAN_EMPTY_BUCKET_KEY
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'

export type GroupWriteResult =
  | { kind: 'set'; value: unknown }
  | { kind: 'clear' }
  | { kind: 'invalid' }

const isEmptyBucket = (
  key: string
) => key === KANBAN_EMPTY_BUCKET_KEY

const parseNumberRangeKey = (
  key: string
): {
  start: number
  interval: number
} | undefined => {
  const match = /^range:([^:]+):([^:]+)$/.exec(key)
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

const normalizeOptionIds = (
  value: unknown
): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const next: string[] = []

  value.forEach(item => {
    if (typeof item !== 'string') {
      return
    }

    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    next.push(normalized)
  })

  return next
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
  bucketKey: string
): GroupWriteResult => (
  isEmptyBucket(bucketKey)
    ? { kind: 'clear' }
    : { kind: 'set', value: bucketKey }
)

const nextNumberValue = (
  bucketKey: string
): GroupWriteResult => {
  if (isEmptyBucket(bucketKey)) {
    return { kind: 'clear' }
  }

  const range = parseNumberRangeKey(bucketKey)
  return range
    ? { kind: 'set', value: range.start }
    : { kind: 'invalid' }
}

const nextSelectValue = (
  field: Extract<Field, { kind: 'select' }>,
  bucketKey: string
): GroupWriteResult => {
  if (isEmptyBucket(bucketKey)) {
    return { kind: 'clear' }
  }

  return fieldApi.option.read.get(field, bucketKey)
    ? { kind: 'set', value: bucketKey }
    : { kind: 'invalid' }
}

const nextStatusValue = (
  field: Extract<Field, { kind: 'status' }>,
  mode: string,
  bucketKey: string
): GroupWriteResult => {
  if (isEmptyBucket(bucketKey)) {
    return { kind: 'clear' }
  }

  if (mode === 'category') {
    const category = bucketKey as typeof fieldApi.status.categories[number]
    if (!fieldApi.status.categories.includes(category)) {
      return { kind: 'invalid' }
    }

    const option = fieldApi.status.defaultOption.get(field, category)
    return option
      ? { kind: 'set', value: option.id }
      : { kind: 'invalid' }
  }

  return fieldApi.option.read.get(field, bucketKey)
    ? { kind: 'set', value: bucketKey }
    : { kind: 'invalid' }
}

const nextBooleanValue = (
  bucketKey: string
): GroupWriteResult => {
  if (isEmptyBucket(bucketKey)) {
    return { kind: 'clear' }
  }

  if (bucketKey === 'true') {
    return { kind: 'set', value: true }
  }

  if (bucketKey === 'false') {
    return { kind: 'set', value: false }
  }

  return { kind: 'invalid' }
}

const nextDateValue = (input: {
  field: Extract<Field, { kind: 'date' }>
  bucketKey: string
  currentValue: unknown
}): GroupWriteResult => {
  if (isEmptyBucket(input.bucketKey)) {
    return { kind: 'clear' }
  }

  const parsed = fieldApi.date.group.parseKey(input.bucketKey)
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
  bucketKey: string
  currentValue: unknown
  fromKey?: string
}): GroupWriteResult => {
  let next = normalizeOptionIds(input.currentValue)

  if (input.fromKey && !isEmptyBucket(input.fromKey)) {
    next = removeOptionId(next, input.fromKey)
  }

  if (!isEmptyBucket(input.bucketKey)) {
    next = appendOptionId(next, input.bucketKey)
  }

  return next.length
    ? { kind: 'set', value: next }
    : { kind: 'clear' }
}

const nextPresenceValue = (
  bucketKey: string
): GroupWriteResult => (
  isEmptyBucket(bucketKey)
    ? { kind: 'clear' }
    : { kind: 'invalid' }
)

export const groupWriteValue = (input: {
  field: Field | undefined
  group: Pick<ViewGroup, 'mode'> | undefined
  currentValue: unknown
  fromKey?: string
  toKey: string
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
      return nextTextValue(input.toKey)
    case 'number':
      return nextNumberValue(input.toKey)
    case 'date':
      return nextDateValue({
        field: input.field,
        bucketKey: input.toKey,
        currentValue: input.currentValue
      })
    case 'select':
      return nextSelectValue(input.field, input.toKey)
    case 'status':
      return nextStatusValue(input.field, input.group.mode, input.toKey)
    case 'boolean':
      return nextBooleanValue(input.toKey)
    case 'multiSelect':
      return nextMultiSelectValue({
        bucketKey: input.toKey,
        currentValue: input.currentValue,
        fromKey: input.fromKey
      })
    case 'asset':
      return nextPresenceValue(input.toKey)
    default:
      return { kind: 'invalid' }
  }
}

export const group = {
  write: {
    value: groupWriteValue
  }
} as const
