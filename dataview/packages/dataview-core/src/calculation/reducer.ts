import type {
  Field,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import { equal } from '@shared/core'



export interface ReducerCapabilitySet {
  count?: true
  unique?: true
  numeric?: true
  option?: true
}

export interface CalculationDemand {
  fieldId: FieldId
  capabilities: ReducerCapabilitySet
}

export interface CalculationEntry {
  empty?: boolean
  uniqueKey?: string
  number?: number
  optionIds?: readonly string[]
}

export interface CountReducerState {
  count: number
  nonEmpty: number
}

export interface UniqueReducerState {
  counts: ReadonlyMap<string, number>
}

export interface NumericReducerState {
  counts: ReadonlyMap<number, number>
  sum: number
}

export interface OptionReducerState {
  counts: ReadonlyMap<string, number>
}

export interface FieldReducerState {
  count?: CountReducerState
  unique?: UniqueReducerState
  numeric?: NumericReducerState
  option?: OptionReducerState
}

export interface FieldReducerBuilder {
  apply: (previous?: CalculationEntry, next?: CalculationEntry) => boolean
  finish: () => FieldReducerState
}

type StringCounterTable = Record<string, number>

const EMPTY_STRING_COUNTS = new Map<string, number>()
const EMPTY_NUMBER_COUNTS = new Map<number, number>()
const EMPTY_OPTION_IDS = [] as readonly string[]
const EMPTY_ENTRY: CalculationEntry = Object.freeze({})
const COUNT_EMPTY_ENTRY: CalculationEntry = Object.freeze({
  empty: true
})
const COUNT_VALUE_ENTRY: CalculationEntry = Object.freeze({
  empty: false
})

export const EMPTY_COUNT_REDUCER_STATE: CountReducerState = Object.freeze({
  count: 0,
  nonEmpty: 0
})

export const EMPTY_UNIQUE_REDUCER_STATE: UniqueReducerState = Object.freeze({
  counts: EMPTY_STRING_COUNTS
})

export const EMPTY_NUMERIC_REDUCER_STATE: NumericReducerState = Object.freeze({
  counts: EMPTY_NUMBER_COUNTS,
  sum: 0
})

export const EMPTY_OPTION_REDUCER_STATE: OptionReducerState = Object.freeze({
  counts: EMPTY_STRING_COUNTS
})

const EMPTY_FIELD_STATE_CACHE = new Map<string, FieldReducerState>()

const readUniqueKey = (
  field: Field | undefined,
  value: unknown
): string => fieldSpec.calculation.uniqueKey(field, value)

const readOptionIds = (
  field: Field | undefined,
  value: unknown
): readonly string[] | undefined => fieldSpec.calculation.optionIds(field, value)

export const sameReducerCapabilities = (
  left: ReducerCapabilitySet,
  right: ReducerCapabilitySet
) => left.count === right.count
  && left.unique === right.unique
  && left.numeric === right.numeric
  && left.option === right.option

export const mergeReducerCapabilities = (
  ...sets: readonly ReducerCapabilitySet[]
): ReducerCapabilitySet => {
  const merged: ReducerCapabilitySet = {}

  for (const capabilities of sets) {
    if (capabilities.count) {
      merged.count = true
    }
    if (capabilities.unique) {
      merged.unique = true
    }
    if (capabilities.numeric) {
      merged.numeric = true
    }
    if (capabilities.option) {
      merged.option = true
    }
  }

  return merged
}

export const reducerCapabilityKey = (
  capabilities: ReducerCapabilitySet
): string => [
  capabilities.count ? 'count' : '',
  capabilities.unique ? 'unique' : '',
  capabilities.numeric ? 'numeric' : '',
  capabilities.option ? 'option' : ''
].join('\u0000')

export const normalizeCalculationDemands = (
  demands: readonly CalculationDemand[] = []
): readonly CalculationDemand[] => {
  const byField = new Map<FieldId, ReducerCapabilitySet>()

  demands.forEach(demand => {
    const previous = byField.get(demand.fieldId)
    byField.set(
      demand.fieldId,
      previous
        ? mergeReducerCapabilities(previous, demand.capabilities)
        : demand.capabilities
    )
  })

  return [...byField.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldId, capabilities]) => ({
      fieldId,
      capabilities
    }))
}

export const sameCalculationDemand = (
  left: readonly CalculationDemand[],
  right: readonly CalculationDemand[]
) => left.length === right.length
  && left.every((demand, index) => {
    const next = right[index]
    return next !== undefined
      && demand.fieldId === next.fieldId
      && sameReducerCapabilities(demand.capabilities, next.capabilities)
  })

export const getEmptyFieldReducerState = (
  capabilities: ReducerCapabilitySet
): FieldReducerState => {
  const key = reducerCapabilityKey(capabilities)
  const cached = EMPTY_FIELD_STATE_CACHE.get(key)
  if (cached) {
    return cached
  }

  const state: FieldReducerState = {
    ...(capabilities.count ? { count: EMPTY_COUNT_REDUCER_STATE } : {}),
    ...(capabilities.unique ? { unique: EMPTY_UNIQUE_REDUCER_STATE } : {}),
    ...(capabilities.numeric ? { numeric: EMPTY_NUMERIC_REDUCER_STATE } : {}),
    ...(capabilities.option ? { option: EMPTY_OPTION_REDUCER_STATE } : {})
  }
  EMPTY_FIELD_STATE_CACHE.set(key, state)
  return state
}

export const createCalculationEntry = (input: {
  field: Field | undefined
  value: unknown
  capabilities: ReducerCapabilitySet
}): CalculationEntry => {
  const needsCount = input.capabilities.count === true
  const needsUnique = input.capabilities.unique === true
  const needsNumeric = input.capabilities.numeric === true
  const needsOption = input.capabilities.option === true
  const empty = fieldApi.value.empty(input.value)

  if (empty) {
    return needsCount
      ? COUNT_EMPTY_ENTRY
      : EMPTY_ENTRY
  }

  const uniqueKey = needsUnique
    ? readUniqueKey(input.field, input.value)
    : undefined
  const number = needsNumeric
    ? fieldApi.value.number(input.value)
    : undefined
  const optionIds = needsOption
    ? readOptionIds(input.field, input.value)
    : undefined

  if (!needsCount && uniqueKey === undefined && number === undefined && !optionIds?.length) {
    return EMPTY_ENTRY
  }

  if (needsCount && uniqueKey === undefined && number === undefined && !optionIds?.length) {
    return COUNT_VALUE_ENTRY
  }

  return {
    ...(needsCount ? { empty: false } : {}),
    ...(uniqueKey === undefined ? {} : { uniqueKey }),
    ...(number === undefined ? {} : { number }),
    ...(optionIds?.length ? { optionIds } : {})
  }
}

export const sameCalculationEntry = (
  left: CalculationEntry | undefined,
  right: CalculationEntry | undefined
) => left === right || (
  left?.empty === right?.empty
  && left?.uniqueKey === right?.uniqueKey
  && left?.number === right?.number
  && equal.sameOrder(left?.optionIds ?? EMPTY_OPTION_IDS, right?.optionIds ?? EMPTY_OPTION_IDS)
)

const sameCountMap = <K,>(
  left: ReadonlyMap<K, number>,
  right: ReadonlyMap<K, number>
) => left === right || (
  left.size === right.size
  && [...left.entries()].every(([key, value]) => right.get(key) === value)
)

interface CounterMapBuilder<K> {
  adjust: (key: K | undefined, delta: number) => void
  finish: () => ReadonlyMap<K, number>
}

const createCounterMapBuilder = <K,>(
  previous: ReadonlyMap<K, number>
): CounterMapBuilder<K> => {
  let next: Map<K, number> | undefined

  const ensure = () => {
    if (!next) {
      next = new Map(previous)
    }

    return next
  }

  return {
    adjust: (key, delta) => {
      if (key === undefined || delta === 0) {
        return
      }

      const target = ensure()
      const current = target.get(key) ?? 0
      const value = current + delta
      if (value > 0) {
        target.set(key, value)
        return
      }

      target.delete(key)
    },
    finish: () => {
      if (!next) {
        return previous
      }

      return sameCountMap(previous, next)
        ? previous
        : next
    }
  }
}

const applyCountDelta = (
  builder: CounterMapBuilder<string>,
  key: string | undefined,
  delta: number
) => {
  builder.adjust(key, delta)
}

const applyNumberDelta = (
  builder: CounterMapBuilder<number>,
  value: number | undefined,
  delta: number
) => {
  builder.adjust(value, delta)
}

const finalizeCountState = (
  previous: CountReducerState | undefined,
  next: CountReducerState | undefined
): CountReducerState | undefined => {
  if (!next) {
    return undefined
  }

  if (previous && previous.count === next.count && previous.nonEmpty === next.nonEmpty) {
    return previous
  }

  if (next.count === 0 && next.nonEmpty === 0) {
    return EMPTY_COUNT_REDUCER_STATE
  }

  return {
    count: next.count,
    nonEmpty: next.nonEmpty
  }
}

const finalizeUniqueState = (
  previous: UniqueReducerState | undefined,
  nextCounts: ReadonlyMap<string, number> | undefined
): UniqueReducerState | undefined => {
  if (!nextCounts) {
    return undefined
  }

  if (previous?.counts === nextCounts) {
    return previous
  }

  return nextCounts.size
    ? {
        counts: nextCounts
      }
    : EMPTY_UNIQUE_REDUCER_STATE
}

const finalizeNumericState = (
  previous: NumericReducerState | undefined,
  nextCounts: ReadonlyMap<number, number> | undefined,
  sum: number | undefined
): NumericReducerState | undefined => {
  if (!nextCounts || sum === undefined) {
    return undefined
  }

  if (previous?.counts === nextCounts && previous.sum === sum) {
    return previous
  }

  return nextCounts.size
    ? {
        counts: nextCounts,
        sum
      }
    : EMPTY_NUMERIC_REDUCER_STATE
}

const finalizeOptionState = (
  previous: OptionReducerState | undefined,
  nextCounts: ReadonlyMap<string, number> | undefined
): OptionReducerState | undefined => {
  if (!nextCounts) {
    return undefined
  }

  if (previous?.counts === nextCounts) {
    return previous
  }

  return nextCounts.size
    ? {
        counts: nextCounts
      }
    : EMPTY_OPTION_REDUCER_STATE
}

const buildReducerState = (input: {
  capabilities: ReducerCapabilitySet
  countState?: CountReducerState
  uniqueCounts?: ReadonlyMap<string, number>
  numericCounts?: ReadonlyMap<number, number>
  numericSum?: number
  optionCounts?: ReadonlyMap<string, number>
}): FieldReducerState => {
  const state: FieldReducerState = {
    ...(input.capabilities.count
      ? {
          count: finalizeCountState(undefined, input.countState)!
        }
      : {}),
    ...(input.capabilities.unique
      ? {
          unique: finalizeUniqueState(undefined, input.uniqueCounts)!
        }
      : {}),
    ...(input.capabilities.numeric
      ? {
          numeric: finalizeNumericState(undefined, input.numericCounts, input.numericSum)!
        }
      : {}),
    ...(input.capabilities.option
      ? {
          option: finalizeOptionState(undefined, input.optionCounts)!
        }
      : {})
  }

  return input.capabilities.count
    || input.capabilities.unique
    || input.capabilities.numeric
    || input.capabilities.option
    ? state
    : getEmptyFieldReducerState(input.capabilities)
}

const createStringCounterTable = (): StringCounterTable => Object.create(null) as StringCounterTable

const finalizeStringCounterTable = (
  table: StringCounterTable | undefined
): ReadonlyMap<string, number> | undefined => {
  if (!table) {
    return undefined
  }

  const counts = new Map<string, number>()
  for (const key in table) {
    counts.set(key, table[key]!)
  }

  return counts.size
    ? counts
    : EMPTY_STRING_COUNTS
}

const buildCountStateFromDenseEntries = (input: {
  entriesByIndex: readonly CalculationEntry[]
  recordIndexes?: readonly number[]
}): CountReducerState => {
  let nonEmpty = 0

  if (input.recordIndexes) {
    for (let index = 0; index < input.recordIndexes.length; index += 1) {
      if (input.entriesByIndex[input.recordIndexes[index]!]!.empty !== true) {
        nonEmpty += 1
      }
    }

    return {
      count: input.recordIndexes.length,
      nonEmpty
    }
  }

  for (let index = 0; index < input.entriesByIndex.length; index += 1) {
    if (input.entriesByIndex[index]!.empty !== true) {
      nonEmpty += 1
    }
  }

  return {
    count: input.entriesByIndex.length,
    nonEmpty
  }
}

const buildUniqueCountsFromDenseEntries = (input: {
  entriesByIndex: readonly CalculationEntry[]
  recordIndexes?: readonly number[]
}): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()

  if (input.recordIndexes) {
    for (let index = 0; index < input.recordIndexes.length; index += 1) {
      const uniqueKey = input.entriesByIndex[input.recordIndexes[index]!]!.uniqueKey
      if (uniqueKey === undefined) {
        continue
      }

      const current = counts.get(uniqueKey)
      counts.set(uniqueKey, current === undefined ? 1 : current + 1)
    }
  } else {
    for (let index = 0; index < input.entriesByIndex.length; index += 1) {
      const uniqueKey = input.entriesByIndex[index]!.uniqueKey
      if (uniqueKey === undefined) {
        continue
      }

      const current = counts.get(uniqueKey)
      counts.set(uniqueKey, current === undefined ? 1 : current + 1)
    }
  }

  return counts.size
    ? counts
    : EMPTY_STRING_COUNTS
}

const buildNumericStateFromDenseEntries = (input: {
  entriesByIndex: readonly CalculationEntry[]
  recordIndexes?: readonly number[]
}): {
  counts: ReadonlyMap<number, number>
  sum: number
} => {
  let sum = 0
  const counts = new Map<number, number>()

  if (input.recordIndexes) {
    for (let index = 0; index < input.recordIndexes.length; index += 1) {
      const number = input.entriesByIndex[input.recordIndexes[index]!]!.number
      if (number === undefined) {
        continue
      }

      sum += number
      const current = counts.get(number)
      counts.set(number, current === undefined ? 1 : current + 1)
    }
  } else {
    for (let index = 0; index < input.entriesByIndex.length; index += 1) {
      const number = input.entriesByIndex[index]!.number
      if (number === undefined) {
        continue
      }

      sum += number
      const current = counts.get(number)
      counts.set(number, current === undefined ? 1 : current + 1)
    }
  }

  return {
    counts: counts.size
      ? counts
      : EMPTY_NUMBER_COUNTS,
    sum
  }
}

const buildOptionCountsFromDenseEntries = (input: {
  entriesByIndex: readonly CalculationEntry[]
  recordIndexes?: readonly number[]
}): ReadonlyMap<string, number> => {
  const counts = createStringCounterTable()

  if (input.recordIndexes) {
    for (let index = 0; index < input.recordIndexes.length; index += 1) {
      const optionIds: readonly string[] | undefined = input.entriesByIndex[input.recordIndexes[index]!]!.optionIds
      if (!optionIds?.length) {
        continue
      }

      const firstOptionId = optionIds[0]
      if (firstOptionId !== undefined) {
        counts[firstOptionId] = (counts[firstOptionId] ?? 0) + 1
      }
      for (let optionIndex = 1; optionIndex < optionIds.length; optionIndex += 1) {
        const optionId = optionIds[optionIndex]!
        counts[optionId] = (counts[optionId] ?? 0) + 1
      }
    }
  } else {
    for (let index = 0; index < input.entriesByIndex.length; index += 1) {
      const optionIds: readonly string[] | undefined = input.entriesByIndex[index]!.optionIds
      if (!optionIds?.length) {
        continue
      }

      const firstOptionId = optionIds[0]
      if (firstOptionId !== undefined) {
        counts[firstOptionId] = (counts[firstOptionId] ?? 0) + 1
      }
      for (let optionIndex = 1; optionIndex < optionIds.length; optionIndex += 1) {
        const optionId = optionIds[optionIndex]!
        counts[optionId] = (counts[optionId] ?? 0) + 1
      }
    }
  }

  return finalizeStringCounterTable(counts)!
}

export const buildFieldReducerState = (input: {
  entries?: ReadonlyMap<RecordId, CalculationEntry>
  entriesByIndex?: readonly CalculationEntry[]
  capabilities: ReducerCapabilitySet
  recordIds?: readonly RecordId[]
  recordIndexes?: readonly number[]
}): FieldReducerState => {
  const {
    entries,
    entriesByIndex,
    capabilities,
    recordIds,
    recordIndexes
  } = input
  if (recordIndexes && !recordIndexes.length) {
    return getEmptyFieldReducerState(input.capabilities)
  }

  if (recordIds && !recordIds.length) {
    return getEmptyFieldReducerState(input.capabilities)
  }

  if (
    !recordIndexes
    && !recordIds
    && !entriesByIndex?.length
    && !entries?.size
  ) {
    return getEmptyFieldReducerState(input.capabilities)
  }

  const needsCount = capabilities.count === true
  const needsUnique = capabilities.unique === true
  const needsNumeric = capabilities.numeric === true
  const needsOption = capabilities.option === true

  if (entriesByIndex) {
    if (needsCount && !needsUnique && !needsNumeric && !needsOption) {
      return buildReducerState({
        capabilities,
        countState: buildCountStateFromDenseEntries({
          entriesByIndex,
          ...(recordIndexes ? { recordIndexes } : {})
        })
      })
    }

    if (!needsCount && needsUnique && !needsNumeric && !needsOption) {
      return buildReducerState({
        capabilities,
        uniqueCounts: buildUniqueCountsFromDenseEntries({
          entriesByIndex,
          ...(recordIndexes ? { recordIndexes } : {})
        })
      })
    }

    if (!needsCount && !needsUnique && needsNumeric && !needsOption) {
      const numericState = buildNumericStateFromDenseEntries({
        entriesByIndex,
        ...(recordIndexes ? { recordIndexes } : {})
      })
      return buildReducerState({
        capabilities,
        numericCounts: numericState.counts,
        numericSum: numericState.sum
      })
    }

    if (!needsCount && !needsUnique && !needsNumeric && needsOption) {
      return buildReducerState({
        capabilities,
        optionCounts: buildOptionCountsFromDenseEntries({
          entriesByIndex,
          ...(recordIndexes ? { recordIndexes } : {})
        })
      })
    }
  }

  let count = needsCount
    ? (recordIndexes?.length ?? recordIds?.length ?? entriesByIndex?.length ?? entries?.size ?? 0)
    : 0
  let nonEmpty = 0
  let numericSum = 0
  const uniqueCounts = needsUnique
    ? new Map<string, number>()
    : undefined
  const numericCounts = needsNumeric
    ? new Map<number, number>()
    : undefined
  const optionCounts = needsOption
    ? createStringCounterTable()
    : undefined

  if (recordIndexes && entriesByIndex) {
    for (let index = 0; index < recordIndexes.length; index += 1) {
      const entry = entriesByIndex[recordIndexes[index]!]!
      if (needsCount && entry.empty !== true) {
        nonEmpty += 1
      }

      const uniqueKey = entry.uniqueKey
      if (uniqueCounts && uniqueKey !== undefined) {
        const current = uniqueCounts.get(uniqueKey)
        uniqueCounts.set(uniqueKey, current === undefined ? 1 : current + 1)
      }

      const number = entry.number
      if (numericCounts && number !== undefined) {
        numericSum += number
        const current = numericCounts.get(number)
        numericCounts.set(number, current === undefined ? 1 : current + 1)
      }

      const optionIds = entry.optionIds
      if (optionCounts && optionIds?.length) {
        const firstOptionId = optionIds[0]
        if (firstOptionId !== undefined) {
          optionCounts[firstOptionId] = (optionCounts[firstOptionId] ?? 0) + 1
        }
        for (let optionIndex = 1; optionIndex < optionIds.length; optionIndex += 1) {
          const optionId = optionIds[optionIndex]!
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1
        }
      }
    }
  } else if (entriesByIndex) {
    for (let index = 0; index < entriesByIndex.length; index += 1) {
      const entry = entriesByIndex[index]!
      if (needsCount && entry.empty !== true) {
        nonEmpty += 1
      }

      const uniqueKey = entry.uniqueKey
      if (uniqueCounts && uniqueKey !== undefined) {
        const current = uniqueCounts.get(uniqueKey)
        uniqueCounts.set(uniqueKey, current === undefined ? 1 : current + 1)
      }

      const number = entry.number
      if (numericCounts && number !== undefined) {
        numericSum += number
        const current = numericCounts.get(number)
        numericCounts.set(number, current === undefined ? 1 : current + 1)
      }

      const optionIds = entry.optionIds
      if (optionCounts && optionIds?.length) {
        const firstOptionId = optionIds[0]
        if (firstOptionId !== undefined) {
          optionCounts[firstOptionId] = (optionCounts[firstOptionId] ?? 0) + 1
        }
        for (let optionIndex = 1; optionIndex < optionIds.length; optionIndex += 1) {
          const optionId = optionIds[optionIndex]!
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1
        }
      }
    }
  } else if (recordIds && entries && recordIds.length === entries.size) {
    for (const entry of entries.values()) {
      if (needsCount && entry.empty !== true) {
        nonEmpty += 1
      }

      const uniqueKey = entry.uniqueKey
      if (uniqueCounts && uniqueKey !== undefined) {
        const current = uniqueCounts.get(uniqueKey)
        uniqueCounts.set(uniqueKey, current === undefined ? 1 : current + 1)
      }

      const number = entry.number
      if (numericCounts && number !== undefined) {
        numericSum += number
        const current = numericCounts.get(number)
        numericCounts.set(number, current === undefined ? 1 : current + 1)
      }

      const optionIds = entry.optionIds
      if (optionCounts && optionIds?.length) {
        const firstOptionId = optionIds[0]
        if (firstOptionId !== undefined) {
          optionCounts[firstOptionId] = (optionCounts[firstOptionId] ?? 0) + 1
        }
        for (let optionIndex = 1; optionIndex < optionIds.length; optionIndex += 1) {
          const optionId = optionIds[optionIndex]!
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1
        }
      }
    }
  } else if (recordIds && entries) {
    for (let index = 0; index < recordIds.length; index += 1) {
      const entry = entries.get(recordIds[index]!)
      if (!entry) {
        if (needsCount) {
          nonEmpty += 1
        }
        continue
      }

      if (needsCount && entry.empty !== true) {
        nonEmpty += 1
      }

      const uniqueKey = entry.uniqueKey
      if (uniqueCounts && uniqueKey !== undefined) {
        const current = uniqueCounts.get(uniqueKey)
        uniqueCounts.set(uniqueKey, current === undefined ? 1 : current + 1)
      }

      const number = entry.number
      if (numericCounts && number !== undefined) {
        numericSum += number
        const current = numericCounts.get(number)
        numericCounts.set(number, current === undefined ? 1 : current + 1)
      }

      const optionIds = entry.optionIds
      if (optionCounts && optionIds?.length) {
        const firstOptionId = optionIds[0]
        if (firstOptionId !== undefined) {
          optionCounts[firstOptionId] = (optionCounts[firstOptionId] ?? 0) + 1
        }
        for (let optionIndex = 1; optionIndex < optionIds.length; optionIndex += 1) {
          const optionId = optionIds[optionIndex]!
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1
        }
      }
    }
  } else if (entries) {
    for (const entry of entries.values()) {
      if (needsCount && entry.empty !== true) {
        nonEmpty += 1
      }

      const uniqueKey = entry.uniqueKey
      if (uniqueCounts && uniqueKey !== undefined) {
        const current = uniqueCounts.get(uniqueKey)
        uniqueCounts.set(uniqueKey, current === undefined ? 1 : current + 1)
      }

      const number = entry.number
      if (numericCounts && number !== undefined) {
        numericSum += number
        const current = numericCounts.get(number)
        numericCounts.set(number, current === undefined ? 1 : current + 1)
      }

      const optionIds = entry.optionIds
      if (optionCounts && optionIds?.length) {
        const firstOptionId = optionIds[0]
        if (firstOptionId !== undefined) {
          optionCounts[firstOptionId] = (optionCounts[firstOptionId] ?? 0) + 1
        }
        for (let optionIndex = 1; optionIndex < optionIds.length; optionIndex += 1) {
          const optionId = optionIds[optionIndex]!
          optionCounts[optionId] = (optionCounts[optionId] ?? 0) + 1
        }
      }
    }
  } else {
    return getEmptyFieldReducerState(capabilities)
  }

  return buildReducerState({
    capabilities,
    ...(needsCount
      ? {
          countState: {
            count,
            nonEmpty
          }
        }
      : {}),
    ...(uniqueCounts
      ? {
          uniqueCounts
        }
      : {}),
    ...(numericCounts
      ? {
          numericCounts,
          numericSum
        }
      : {}),
    ...(optionCounts
      ? {
          optionCounts: finalizeStringCounterTable(optionCounts)
        }
      : {})
  })
}

export const createFieldReducerBuilder = (input: {
  previous: FieldReducerState
  capabilities: ReducerCapabilitySet
}): FieldReducerBuilder => {
  const countState = input.capabilities.count
    ? {
        count: input.previous.count?.count ?? 0,
        nonEmpty: input.previous.count?.nonEmpty ?? 0
      }
    : undefined
  const uniqueCounts = input.capabilities.unique
    ? createCounterMapBuilder(input.previous.unique?.counts ?? EMPTY_STRING_COUNTS)
    : undefined
  const numericCounts = input.capabilities.numeric
    ? createCounterMapBuilder(input.previous.numeric?.counts ?? EMPTY_NUMBER_COUNTS)
    : undefined
  const optionCounts = input.capabilities.option
    ? createCounterMapBuilder(input.previous.option?.counts ?? EMPTY_STRING_COUNTS)
    : undefined
  let numericSum = input.capabilities.numeric
    ? input.previous.numeric?.sum ?? 0
    : undefined
  let changed = false

  return {
    apply(previousEntry, nextEntry) {
      if (sameCalculationEntry(previousEntry, nextEntry)) {
        return false
      }

      changed = true

      if (countState) {
        if (previousEntry) {
          countState.count -= 1
          if (!previousEntry.empty) {
            countState.nonEmpty -= 1
          }
        }
        if (nextEntry) {
          countState.count += 1
          if (!nextEntry.empty) {
            countState.nonEmpty += 1
          }
        }
      }

      if (uniqueCounts) {
        applyCountDelta(uniqueCounts, previousEntry?.uniqueKey, -1)
        applyCountDelta(uniqueCounts, nextEntry?.uniqueKey, 1)
      }

      if (numericCounts && numericSum !== undefined) {
        if (previousEntry?.number !== undefined) {
          numericSum -= previousEntry.number
        }
        if (nextEntry?.number !== undefined) {
          numericSum += nextEntry.number
        }
        applyNumberDelta(numericCounts, previousEntry?.number, -1)
        applyNumberDelta(numericCounts, nextEntry?.number, 1)
      }

      if (optionCounts) {
        previousEntry?.optionIds?.forEach(optionId => {
          applyCountDelta(optionCounts, optionId, -1)
        })
        nextEntry?.optionIds?.forEach(optionId => {
          applyCountDelta(optionCounts, optionId, 1)
        })
      }

      return true
    },
    finish() {
      if (!changed) {
        return input.previous
      }

      const next: FieldReducerState = {
        ...(input.capabilities.count
          ? {
              count: finalizeCountState(input.previous.count, countState)!
            }
          : {}),
        ...(input.capabilities.unique
          ? {
              unique: finalizeUniqueState(input.previous.unique, uniqueCounts?.finish())!
            }
          : {}),
        ...(input.capabilities.numeric
          ? {
              numeric: finalizeNumericState(input.previous.numeric, numericCounts?.finish(), numericSum)!
            }
          : {}),
        ...(input.capabilities.option
          ? {
              option: finalizeOptionState(input.previous.option, optionCounts?.finish())!
            }
          : {})
      }

      return (
        next.count === input.previous.count
        && next.unique === input.previous.unique
        && next.numeric === input.previous.numeric
        && next.option === input.previous.option
      )
        ? input.previous
        : next
    }
  }
}
