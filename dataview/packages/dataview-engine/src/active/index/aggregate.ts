import type {
  Field,
  RecordId
} from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldDisplayValue,
  hasFieldOptions,
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
} from '@dataview/engine/active/index/contracts'

interface MutableAggregateState {
  count: number
  nonEmpty: number
  sum: number
  hasNumber: boolean
  min?: number | string | null
  max?: number | string | null
  distribution: Map<string, number>
  uniqueCounts: Map<string, number>
  numberCounts: Map<number, number>
  optionCounts: Map<string, number>
  mustRecomputeRange: boolean
}

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

const normalizeOptionId = (
  field: Field | undefined,
  value: unknown
): string | undefined => {
  if (!hasFieldOptions(field) || typeof value !== 'string') {
    return undefined
  }

  return getFieldOption(field, value)?.id ?? trimToUndefined(value)
}

const readOptionIds = (
  field: Field | undefined,
  value: unknown
): readonly string[] | undefined => {
  if (!hasFieldOptions(field)) {
    return undefined
  }

  if (field.kind === 'multiSelect') {
    if (!Array.isArray(value)) {
      return undefined
    }

    const rawOptionIds = value.flatMap(item => {
      const optionId = normalizeOptionId(field, item)
      return optionId ? [optionId] : []
    })
    const optionIds = Array.from(new Set(rawOptionIds))
      .sort((left, right) => left.localeCompare(right))

    return optionIds.length ? optionIds : undefined
  }

  const optionId = normalizeOptionId(field, value)
  return optionId ? [optionId] : undefined
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
    optionIds: readOptionIds(field, value),
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
    entry.optionIds?.forEach(optionId => {
      optionCounts.set(optionId, (optionCounts.get(optionId) ?? 0) + 1)
    })
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

export const buildAggregateStateForRecordIds = (input: {
  recordIds: readonly RecordId[]
  entries: ReadonlyMap<RecordId, AggregateEntry>
}): AggregateState => {
  if (!input.recordIds.length || !input.entries.size) {
    return buildAggregateState(new Map())
  }

  let count = 0
  let nonEmpty = 0
  let sum = 0
  let hasNumber = false
  const distribution = new Map<string, number>()
  const uniqueCounts = new Map<string, number>()
  const numberCounts = new Map<number, number>()
  const optionCounts = new Map<string, number>()
  let min: number | string | null | undefined
  let max: number | string | null | undefined

  for (const recordId of input.recordIds) {
    const entry = input.entries.get(recordId)
    if (!entry) {
      continue
    }

    count += 1
    if (entry.empty) {
      continue
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
    entry.optionIds?.forEach(optionId => {
      optionCounts.set(optionId, (optionCounts.get(optionId) ?? 0) + 1)
    })
    if (entry.comparable !== undefined) {
      if (typeof entry.comparable === 'number') {
        min = min === undefined ? entry.comparable : Math.min(min as number, entry.comparable)
        max = max === undefined ? entry.comparable : Math.max(max as number, entry.comparable)
      } else {
        min = min === undefined ? entry.comparable : String(min) < entry.comparable ? min : entry.comparable
        max = max === undefined ? entry.comparable : String(max) > entry.comparable ? max : entry.comparable
      }
    }
  }

  return {
    count,
    nonEmpty,
    ...(hasNumber ? { sum } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
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

const decrementMapCounts = <T,>(
  map: Map<T, number>,
  keys: readonly T[] | undefined
) => {
  keys?.forEach(key => {
    decrementMapCount(map, key)
  })
}

const incrementMapCounts = <T,>(
  map: Map<T, number>,
  keys: readonly T[] | undefined
) => {
  keys?.forEach(key => {
    incrementMapCount(map, key)
  })
}

const sameOptionIds = (
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
) => {
  if (left === right) {
    return true
  }
  if (!left || !right || left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
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
    && sameOptionIds(left?.optionIds, right?.optionIds)
  )

const createMutableAggregateState = (
  state: AggregateState
): MutableAggregateState => ({
  count: state.count,
  nonEmpty: state.nonEmpty,
  sum: state.sum ?? 0,
  hasNumber: state.sum !== undefined,
  min: state.min,
  max: state.max,
  distribution: new Map(state.distribution),
  uniqueCounts: new Map(state.uniqueCounts),
  numberCounts: new Map(state.numberCounts),
  optionCounts: new Map(state.optionCounts),
  mustRecomputeRange: false
})

const applyAggregateEntryDelta = (
  state: MutableAggregateState,
  previous?: AggregateEntry,
  next?: AggregateEntry
) => {
  if (sameAggregateEntry(previous, next)) {
    return false
  }

  if (previous) {
    state.count -= 1
    if (!previous.empty) {
      state.nonEmpty -= 1
      decrementMapCount(state.distribution, previous.label)
      decrementMapCount(state.uniqueCounts, previous.uniqueKey)
      decrementMapCount(state.numberCounts, previous.number)
      decrementMapCounts(state.optionCounts, previous.optionIds)
      if (previous.number !== undefined) {
        state.sum -= previous.number
        state.hasNumber = state.numberCounts.size > 0
      }
      if (
        previous.comparable !== undefined
        && (
          previous.comparable === state.min
          || previous.comparable === state.max
        )
      ) {
        state.mustRecomputeRange = true
      }
    }
  }

  if (next) {
    state.count += 1
    if (!next.empty) {
      state.nonEmpty += 1
      incrementMapCount(state.distribution, next.label)
      incrementMapCount(state.uniqueCounts, next.uniqueKey)
      incrementMapCount(state.numberCounts, next.number)
      incrementMapCounts(state.optionCounts, next.optionIds)
      if (next.number !== undefined) {
        state.sum += next.number
        state.hasNumber = true
      }
    }
  }

  if (
    !state.mustRecomputeRange
    && next
    && !next.empty
    && next.comparable !== undefined
  ) {
    if (typeof next.comparable === 'number') {
      state.min = state.min === undefined
        ? next.comparable
        : Math.min(state.min as number, next.comparable)
      state.max = state.max === undefined
        ? next.comparable
        : Math.max(state.max as number, next.comparable)
    } else {
      state.min = state.min === undefined
        ? next.comparable
        : String(state.min) < next.comparable ? state.min : next.comparable
      state.max = state.max === undefined
        ? next.comparable
        : String(state.max) > next.comparable ? state.max : next.comparable
    }
  }

  return true
}

export interface AggregateBuilder {
  apply(previous?: AggregateEntry, next?: AggregateEntry): void
  changed(): boolean
  finish(entries?: ReadonlyMap<RecordId, AggregateEntry>): AggregateState
}

export const createAggregateBuilder = (
  previous: AggregateState
): AggregateBuilder => {
  let next: MutableAggregateState | undefined

  const ensure = () => {
    if (!next) {
      next = createMutableAggregateState(previous)
    }

    return next
  }

  return {
    apply: (previousEntry, nextEntry) => {
      if (sameAggregateEntry(previousEntry, nextEntry)) {
        return
      }

      applyAggregateEntryDelta(
        next ?? ensure(),
        previousEntry,
        nextEntry
      )
    },
    changed: () => next !== undefined,
    finish: entries => {
      if (!next) {
        return previous
      }

      const range = next.mustRecomputeRange
        ? (
            entries
              ? readRange(entries)
              : readNumberRange(next.numberCounts)
          )
        : {
            ...(next.min !== undefined ? { min: next.min } : {}),
            ...(next.max !== undefined ? { max: next.max } : {})
          }

      return {
        count: next.count,
        nonEmpty: next.nonEmpty,
        ...(next.hasNumber ? { sum: next.sum } : {}),
        ...(range.min !== undefined ? { min: range.min } : {}),
        ...(range.max !== undefined ? { max: range.max } : {}),
        distribution: next.distribution,
        uniqueCounts: next.uniqueCounts,
        numberCounts: next.numberCounts,
        optionCounts: next.optionCounts
      }
    }
  }
}

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
      decrementMapCounts(optionCounts, input.previous.optionIds)
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
      incrementMapCounts(optionCounts, input.next.optionIds)
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
