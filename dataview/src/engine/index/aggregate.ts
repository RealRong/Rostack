import type {
  Field,
  RecordId
} from '@dataview/core/contracts'
import {
  getFieldDisplayValue,
  isEmptyFieldValue,
  readBooleanValue,
  readNumberValue
} from '@dataview/core/field'
import type {
  AggregateEntry,
  AggregateState
} from './types'

const asPlainString = (value: unknown) => (
  typeof value === 'string'
    ? value.trim()
    : ''
)

const stableSerialize = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
    return `{${entries.join(',')}}`
  }

  return String(value)
}

const uniqueValueKey = (
  field: Field | undefined,
  value: unknown
): string => {
  switch (field?.kind) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return `text:${asPlainString(value)}`
    case 'number': {
      const numeric = readNumberValue(value)
      return numeric === undefined ? stableSerialize(value) : `number:${numeric}`
    }
    case 'boolean': {
      const booleanValue = readBooleanValue(value)
      return booleanValue === undefined ? stableSerialize(value) : `boolean:${booleanValue}`
    }
    case 'select':
    case 'status':
      return `option:${asPlainString(value)}`
    case 'multiSelect': {
      if (!Array.isArray(value)) {
        return stableSerialize(value)
      }

      const normalized = value
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
      return `multi:${JSON.stringify(normalized)}`
    }
    default:
      return stableSerialize(value)
  }
}

export const createAggregateEntry = (
  field: Field | undefined,
  value: unknown
): AggregateEntry => {
  if (isEmptyFieldValue(value)) {
    return {
      empty: true
    }
  }

  const number = readNumberValue(value)

  return {
    empty: false,
    label: getFieldDisplayValue(field, value) ?? JSON.stringify(value),
    optionId: field?.kind === 'status' && typeof value === 'string' && value.trim()
      ? value.trim()
      : undefined,
    uniqueKey: uniqueValueKey(field, value),
    comparable: number !== undefined
      ? number
      : typeof value === 'string'
        ? value
        : undefined,
    number
  }
}

const readRange = (
  entries: ReadonlyMap<RecordId, AggregateEntry>
): Pick<AggregateState, 'min' | 'max'> => {
  let min: number | string | null | undefined
  let max: number | string | null | undefined

  entries.forEach(entry => {
    if (entry.empty || entry.comparable === undefined) {
      return
    }

    if (typeof entry.comparable === 'number') {
      min = min === undefined ? entry.comparable : Math.min(min as number, entry.comparable)
      max = max === undefined ? entry.comparable : Math.max(max as number, entry.comparable)
      return
    }

    min = min === undefined ? entry.comparable : String(min) < entry.comparable ? min : entry.comparable
    max = max === undefined ? entry.comparable : String(max) > entry.comparable ? max : entry.comparable
  })

  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {})
  }
}

export const buildAggregateState = (
  entries: ReadonlyMap<RecordId, AggregateEntry>
): AggregateState => {
  let count = 0
  let nonEmpty = 0
  let sum = 0
  let hasNumber = false
  const distribution = new Map<string, number>()
  const uniqueCounts = new Map<string, number>()
  const numberCounts = new Map<number, number>()
  const optionCounts = new Map<string, number>()

  entries.forEach(entry => {
    count += 1
    if (entry.empty) {
      return
    }

    nonEmpty += 1
    if (entry.label) {
      distribution.set(entry.label, (distribution.get(entry.label) ?? 0) + 1)
    }
    if (entry.uniqueKey) {
      uniqueCounts.set(entry.uniqueKey, (uniqueCounts.get(entry.uniqueKey) ?? 0) + 1)
    }
    if (entry.number !== undefined) {
      sum += entry.number
      hasNumber = true
      numberCounts.set(entry.number, (numberCounts.get(entry.number) ?? 0) + 1)
    }
    if (entry.optionId) {
      optionCounts.set(entry.optionId, (optionCounts.get(entry.optionId) ?? 0) + 1)
    }
  })

  return {
    count,
    nonEmpty,
    ...(hasNumber ? { sum } : {}),
    ...readRange(entries),
    distribution,
    uniqueCounts,
    numberCounts,
    optionCounts,
    entries
  }
}

export const applyAggregateEntry = (input: {
  state: AggregateState
  recordId: RecordId
  next?: AggregateEntry
}): AggregateState => {
  const entries = new Map(input.state.entries)
  if (input.next) {
    entries.set(input.recordId, input.next)
  } else {
    entries.delete(input.recordId)
  }

  return buildAggregateState(entries)
}
