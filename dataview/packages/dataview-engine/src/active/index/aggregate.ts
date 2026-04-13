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
import {
  trimToUndefined
} from '@shared/core'
import type {
  AggregateEntry,
  AggregateState,
  SectionAggregateState
} from '#engine/active/index/contracts.ts'

const asPlainString = (value: unknown) => (
  trimToUndefined(value) ?? ''
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
        .flatMap(item => {
          const normalizedItem = trimToUndefined(item)
          return normalizedItem ? [normalizedItem] : []
        })
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
    optionId: field?.kind === 'status'
      ? trimToUndefined(value)
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

const readNumberRange = (
  numberCounts: ReadonlyMap<number, number>
): Pick<AggregateState, 'min' | 'max'> => {
  if (!numberCounts.size) {
    return {}
  }

  const values = Array.from(numberCounts.keys()).sort((left, right) => left - right)
  return {
    min: values[0],
    max: values[values.length - 1]
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
    optionCounts
  }
}

export const buildSectionAggregateState = (
  entries: ReadonlyMap<RecordId, AggregateEntry>
): SectionAggregateState => ({
  ...buildAggregateState(entries),
  entries
})

const decrementMapCount = <T,>(
  map: Map<T, number>,
  key: T | undefined
) => {
  if (key === undefined) {
    return
  }

  const current = map.get(key)
  if (current === undefined) {
    return
  }
  if (current <= 1) {
    map.delete(key)
    return
  }

  map.set(key, current - 1)
}

const incrementMapCount = <T,>(
  map: Map<T, number>,
  key: T | undefined
) => {
  if (key === undefined) {
    return
  }

  map.set(key, (map.get(key) ?? 0) + 1)
}

export const sameAggregateEntry = (
  left: AggregateEntry | undefined,
  right: AggregateEntry | undefined
) => left === right
  || (
    Boolean(left)
    && Boolean(right)
    && left?.empty === right?.empty
    && left?.label === right?.label
    && left?.number === right?.number
    && left?.comparable === right?.comparable
    && left?.uniqueKey === right?.uniqueKey
    && left?.optionId === right?.optionId
  )

export const patchAggregateState = (input: {
  state: AggregateState
  previous?: AggregateEntry
  next?: AggregateEntry
  entries?: ReadonlyMap<RecordId, AggregateEntry>
}): AggregateState => {
  if (sameAggregateEntry(input.previous, input.next)) {
    return input.state
  }

  const distribution = new Map(input.state.distribution)
  const uniqueCounts = new Map(input.state.uniqueCounts)
  const numberCounts = new Map(input.state.numberCounts)
  const optionCounts = new Map(input.state.optionCounts)
  let count = input.state.count
  let nonEmpty = input.state.nonEmpty
  let sum = input.state.sum ?? 0
  let hasNumber = input.state.sum !== undefined
  let mustRecomputeRange = false

  if (input.previous) {
    count -= 1
    if (!input.previous.empty) {
      nonEmpty -= 1
      decrementMapCount(distribution, input.previous.label)
      decrementMapCount(uniqueCounts, input.previous.uniqueKey)
      decrementMapCount(numberCounts, input.previous.number)
      decrementMapCount(optionCounts, input.previous.optionId)
      if (input.previous.number !== undefined) {
        sum -= input.previous.number
        hasNumber = numberCounts.size > 0
      }
      if (
        input.previous.comparable !== undefined
        && (
          input.previous.comparable === input.state.min
          || input.previous.comparable === input.state.max
        )
      ) {
        mustRecomputeRange = true
      }
    }
  }

  if (input.next) {
    count += 1
    if (!input.next.empty) {
      nonEmpty += 1
      incrementMapCount(distribution, input.next.label)
      incrementMapCount(uniqueCounts, input.next.uniqueKey)
      incrementMapCount(numberCounts, input.next.number)
      incrementMapCount(optionCounts, input.next.optionId)
      if (input.next.number !== undefined) {
        sum += input.next.number
        hasNumber = true
      }
    }
  }

  const nextRange = mustRecomputeRange
    ? (
        input.entries
          ? readRange(input.entries)
          : readNumberRange(numberCounts)
      )
    : {
        ...(input.state.min !== undefined ? { min: input.state.min } : {}),
        ...(input.state.max !== undefined ? { max: input.state.max } : {})
      }

  if (
    input.next
    && !input.next.empty
    && input.next.comparable !== undefined
  ) {
    if (typeof input.next.comparable === 'number') {
      nextRange.min = nextRange.min === undefined
        ? input.next.comparable
        : Math.min(nextRange.min as number, input.next.comparable)
      nextRange.max = nextRange.max === undefined
        ? input.next.comparable
        : Math.max(nextRange.max as number, input.next.comparable)
    } else {
      nextRange.min = nextRange.min === undefined
        ? input.next.comparable
        : String(nextRange.min) < input.next.comparable ? nextRange.min : input.next.comparable
      nextRange.max = nextRange.max === undefined
        ? input.next.comparable
        : String(nextRange.max) > input.next.comparable ? nextRange.max : input.next.comparable
    }
  }

  return {
    count,
    nonEmpty,
    ...(hasNumber ? { sum } : {}),
    ...(nextRange.min !== undefined ? { min: nextRange.min } : {}),
    ...(nextRange.max !== undefined ? { max: nextRange.max } : {}),
    distribution,
    uniqueCounts,
    numberCounts,
    optionCounts
  }
}

export const patchSectionAggregateState = (input: {
  state: SectionAggregateState
  recordId: RecordId
  previous?: AggregateEntry
  next?: AggregateEntry
}): SectionAggregateState => {
  const previousEntry = input.previous ?? input.state.entries.get(input.recordId)
  if (sameAggregateEntry(previousEntry, input.next)) {
    return input.state
  }

  const entries = new Map(input.state.entries)
  if (previousEntry) {
    entries.delete(input.recordId)
  }
  if (input.next) {
    entries.set(input.recordId, input.next)
  }

  return {
    ...patchAggregateState({
      state: input.state,
      previous: previousEntry,
      next: input.next,
      entries
    }),
    entries
  }
}

export const applyAggregateEntry = (input: {
  state: SectionAggregateState
  recordId: RecordId
  next?: AggregateEntry
}): SectionAggregateState => patchSectionAggregateState({
  state: input.state,
  recordId: input.recordId,
  next: input.next
})
