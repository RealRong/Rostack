import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  type Equality,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type {
  State,
  Store
} from './state'

export const createStoreSelector = <T,>(input: {
  store: ReadStore<State>
  read: (state: State) => T
  isEqual?: Equality<T>
}): ReadStore<T> => createDerivedStore({
  get: () => input.read(read(input.store)),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const createStoreKeyedSelector = <K, T>(input: {
  store: ReadStore<State>
  read: (state: State, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}): KeyedReadStore<K, T> => createKeyedDerivedStore({
  get: key => input.read(read(input.store), key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})

export const selectDoc = <T,>(input: {
  store: Store
  read: (document: DataDoc) => T
  isEqual?: Equality<T>
}) => createStoreSelector({
  store: input.store,
  read: state => input.read(state.doc),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const selectDocById = <K, T>(input: {
  store: Store
  read: (document: DataDoc, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}) => createStoreKeyedSelector({
  store: input.store,
  read: (state, key: K) => input.read(state.doc, key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})
