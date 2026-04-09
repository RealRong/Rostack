import type {
  Field,
  RecordId
} from '@dataview/core/contracts'
import {
  getFieldDisplayValue,
  isEmptyFieldValue
} from '@dataview/core/field'
import type {
  AggregateEntry,
  AggregateState
} from './types'

export const createAggregateEntry = (
  field: Field | undefined,
  value: unknown
): AggregateEntry => {
  if (isEmptyFieldValue(value)) {
    return {
      empty: true
    }
  }

  return {
    empty: false,
    label: getFieldDisplayValue(field, value) ?? JSON.stringify(value),
    number: typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined,
    comparable: typeof value === 'number' || typeof value === 'string'
      ? value
      : undefined
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

  entries.forEach(entry => {
    count += 1
    if (entry.empty) {
      return
    }

    nonEmpty += 1
    if (entry.label) {
      distribution.set(entry.label, (distribution.get(entry.label) ?? 0) + 1)
    }
    if (entry.number !== undefined) {
      sum += entry.number
      hasNumber = true
    }
  })

  return {
    count,
    nonEmpty,
    ...(hasNumber ? { sum } : {}),
    ...readRange(entries),
    distribution,
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
