import {
  batch
} from './batch'
import {
  createDerivedStore
} from './derived'
import {
  createKeyedDerivedStore
} from './family'
import {
  createFamilyStore
} from './familyStore'
import {
  createKeyedReadStore,
  createKeyedStore
} from './keyed'
import {
  joinUnsubscribes
} from './listeners'
import {
  createProjectedKeyedStore,
  createProjectedStore
} from './projected'
import {
  peek,
  read
} from './read'
import {
  createStructKeyedStore,
  createStructStore
} from './struct'
import {
  createTableStore
} from './table'
import type {
  KeyedReadStore,
  ReadStore
} from './types'
import {
  createNormalizedValue,
  createReadStore,
  createValueStore
} from './value'

export {
  batch,
  createDerivedStore,
  createFamilyStore,
  createKeyedDerivedStore,
  createKeyedReadStore,
  createKeyedStore,
  createNormalizedValue,
  createProjectedKeyedStore,
  createProjectedStore,
  createReadStore,
  createStructKeyedStore,
  createStructStore,
  createTableStore,
  createValueStore,
  joinUnsubscribes,
  peek,
  read
}

export type * from './types'

const NOOP_UNSUBSCRIBE = () => {}
const NOOP_SUBSCRIBE = (
  _listener: () => void
) => NOOP_UNSUBSCRIBE
const NOOP_KEYED_SUBSCRIBE = <TKey,>(
  _key: TKey,
  _listener: () => void
) => NOOP_UNSUBSCRIBE

const isReadStore = (
  value: unknown
): value is ReadStore<unknown> => (
  typeof value === 'object'
  && value !== null
  && 'get' in value
  && 'subscribe' in value
)

const readObjectField = (
  value: unknown
): unknown => {
  if (isReadStore(value)) {
    return read(value)
  }

  if (typeof value !== 'object' || value === null) {
    return value
  }

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    next[key] = readObjectField(child)
  }
  return next
}

export const value = <T,>(spec: {
  get(): T
  subscribe?(listener: () => void): () => void
  isEqual?(left: T, right: T): boolean
}) => createReadStore({
  get: spec.get,
  subscribe: spec.subscribe ?? NOOP_SUBSCRIBE,
  ...(spec.isEqual
    ? {
        isEqual: spec.isEqual
      }
    : {})
})

export const keyed = <TKey, TValue>(spec: {
  get(key: TKey): TValue
  subscribe?(key: TKey, listener: () => void): () => void
  isEqual?(left: TValue, right: TValue): boolean
}): KeyedReadStore<TKey, TValue> => createKeyedReadStore({
  get: spec.get,
  subscribe: spec.subscribe ?? NOOP_KEYED_SUBSCRIBE<TKey>,
  ...(spec.isEqual
    ? {
        isEqual: spec.isEqual
      }
    : {})
})

export const family = <TId extends string, TValue>(spec: {
  ids(): readonly TId[]
  get(id: TId): TValue | undefined
  subscribeIds?(listener: () => void): () => void
  subscribeKey?(id: TId, listener: () => void): () => void
  isEqual?(left: TValue | undefined, right: TValue | undefined): boolean
}) => ({
  ids: createReadStore({
    get: spec.ids,
    subscribe: spec.subscribeIds ?? NOOP_SUBSCRIBE
  }),
  byId: createKeyedReadStore({
    get: spec.get,
    subscribe: spec.subscribeKey ?? NOOP_KEYED_SUBSCRIBE<TId>,
    ...(spec.isEqual
      ? {
          isEqual: spec.isEqual
        }
      : {})
  })
})

export const object = <TFields extends Record<string, unknown>>(
  fields: TFields
): ReadStore<{ [TKey in keyof TFields]: unknown }> => createDerivedStore({
  get: () => readObjectField(fields) as { [TKey in keyof TFields]: unknown }
})

export const store = {
  peek,
  read,
  batch,
  value,
  keyed,
  family,
  object,
  createNormalizedValue,
  createReadStore,
  createValueStore,
  createKeyedReadStore,
  createKeyedStore,
  createDerivedStore,
  createKeyedDerivedStore,
  createProjectedStore,
  createProjectedKeyedStore,
  createStructStore,
  createStructKeyedStore,
  createTableStore,
  createFamilyStore,
  joinUnsubscribes
} as const
