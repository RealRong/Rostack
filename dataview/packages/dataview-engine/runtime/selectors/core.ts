import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  type Equality,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { EngineRuntimeState } from '../state'

export const createRuntimeSelector = <T,>(input: {
  store: ReadStore<EngineRuntimeState>
  read: (state: EngineRuntimeState) => T
  isEqual?: Equality<T>
}): ReadStore<T> => createDerivedStore({
  get: () => input.read(read(input.store)),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const createRuntimeKeyedSelector = <K, T>(input: {
  store: ReadStore<EngineRuntimeState>
  read: (state: EngineRuntimeState, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}): KeyedReadStore<K, T> => createKeyedDerivedStore({
  get: key => input.read(read(input.store), key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})
