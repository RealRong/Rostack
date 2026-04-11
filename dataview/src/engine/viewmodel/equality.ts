import type {
  Field,
} from '@dataview/core/contracts'
import type {
  Schema
} from './types'

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

const equalStableValue = (
  left: unknown,
  right: unknown
) => stableSerialize(left) === stableSerialize(right)

const equalMap = <K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>,
  equal: (left: V, right: V) => boolean
) => {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, value] of left) {
    const next = right.get(key)
    if (next === undefined && !right.has(key)) {
      return false
    }
    if (!equal(value, next as V)) {
      return false
    }
  }

  return true
}

const equalField = (
  left: Field,
  right: Field
) => equalStableValue(left, right)

export const sameSchema = (
  left: Schema,
  right: Schema
) => equalMap(left.fields, right.fields, equalField)
