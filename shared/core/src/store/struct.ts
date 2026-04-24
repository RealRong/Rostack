import type { Equality } from '../equality'
import {
  createDerivedStore
} from './derived'
import {
  createKeyedDerivedStore
} from './family'
import type {
  KeyedReadStore,
  ReadStore
} from './types'

type StructField<TValue> = {
  get: () => TValue
  isEqual?: Equality<TValue>
}

type StructKeyedField<TKey, TValue> = {
  get: (key: TKey) => TValue
  isEqual?: Equality<TValue>
}

type StructFields<TStruct extends Record<string, unknown>> = {
  [K in keyof TStruct]: StructField<TStruct[K]>
}

type StructKeyedFields<TKey, TStruct extends Record<string, unknown>> = {
  [K in keyof TStruct]: StructKeyedField<TKey, TStruct[K]>
}

const sameValue = <TValue,>(
  left: TValue,
  right: TValue
) => Object.is(left, right)

const buildStruct = <TStruct extends Record<string, unknown>,>(
  fields: {
    [K in keyof TStruct]: {
      get: () => TStruct[K]
    }
  }
): TStruct => {
  const next = {} as TStruct
  for (const key in fields) {
    next[key] = fields[key].get()
  }
  return next
}

const buildKeyedStruct = <TKey, TStruct extends Record<string, unknown>,>(
  key: TKey,
  fields: {
    [K in keyof TStruct]: {
      get: (key: TKey) => TStruct[K]
    }
  }
): TStruct => {
  const next = {} as TStruct
  for (const fieldKey in fields) {
    next[fieldKey] = fields[fieldKey].get(key)
  }
  return next
}

const createStructEquality = <TStruct extends Record<string, unknown>,>(
  fields: {
    [K in keyof TStruct]: {
      isEqual?: Equality<TStruct[K]>
    }
  }
): Equality<TStruct> => (
  left,
  right
) => {
  if (left === right) {
    return true
  }

  for (const key in fields) {
    const isEqual = fields[key].isEqual ?? sameValue<TStruct[typeof key]>
    if (!isEqual(left[key], right[key])) {
      return false
    }
  }

  return true
}

export const createStructStore = <TStruct extends Record<string, unknown>,>(
  options: {
    fields: StructFields<TStruct>
  }
): ReadStore<TStruct> => createDerivedStore<TStruct>({
  get: () => buildStruct(options.fields),
  isEqual: createStructEquality(options.fields)
})

export const createStructKeyedStore = <TKey, TStruct extends Record<string, unknown>>(
  options: {
    fields: StructKeyedFields<TKey, TStruct>
    keyOf?: (key: TKey) => unknown
  }
): KeyedReadStore<TKey, TStruct> => createKeyedDerivedStore<TKey, TStruct>({
  get: (key) => buildKeyedStruct(key, options.fields),
  isEqual: createStructEquality(options.fields),
  ...(options.keyOf ? {
    keyOf: options.keyOf
  } : {})
})
