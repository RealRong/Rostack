import {
  json
} from '@shared/core'
import type {
  MutationFootprint
} from '@shared/mutation'

export type HistoryKey = MutationFootprint

export type HistoryFootprint = readonly HistoryKey[]

export interface HistoryKeyCollector {
  add(key: HistoryKey): void
  addMany(keys: Iterable<HistoryKey>): void
  has(key: HistoryKey): boolean
  finish(): HistoryFootprint
  clear(): void
}

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const readString = (
  value: unknown
): string | undefined => typeof value === 'string' && value.length > 0
  ? value
  : undefined

const isHistoryKey = (
  value: unknown
): value is HistoryKey => {
  if (!isObjectRecord(value) || typeof value.kind !== 'string' || typeof value.family !== 'string') {
    return false
  }

  switch (value.kind) {
    case 'global':
      return value.family.length > 0
    case 'entity':
      return readString(value.id) !== undefined
    case 'field':
      return readString(value.id) !== undefined && readString(value.field) !== undefined
    case 'record':
      return (
        readString(value.id) !== undefined
        && readString(value.scope) !== undefined
        && typeof value.path === 'string'
      )
    case 'relation':
      return (
        readString(value.id) !== undefined
        && readString(value.relation) !== undefined
        && (value.target === undefined || readString(value.target) !== undefined)
      )
    default:
      return false
  }
}

const serializeHistoryKey = (
  key: HistoryKey
): string => json.stableStringify(key)

export const createHistoryKeyCollector = (): HistoryKeyCollector => {
  const byKey = new Map<string, HistoryKey>()

  const add = (
    key: HistoryKey
  ) => {
    byKey.set(serializeHistoryKey(key), key)
  }

  return {
    add,
    addMany: (keys) => {
      for (const key of keys) {
        add(key)
      }
    },
    has: (key) => byKey.has(serializeHistoryKey(key)),
    finish: () => [...byKey.values()],
    clear: () => {
      byKey.clear()
    }
  }
}

export const assertHistoryFootprint = (
  value: unknown
): HistoryFootprint => {
  if (!Array.isArray(value)) {
    throw new Error('History footprint must be an array.')
  }

  value.forEach((entry) => {
    if (!isHistoryKey(entry)) {
      throw new Error('History footprint entry is invalid.')
    }
  })

  return value
}

export {
  isHistoryKey
}
