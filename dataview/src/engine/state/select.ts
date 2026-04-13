import type { DataDoc } from '@dataview/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  type Equality,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { EngineState, Store } from './store'

export const createStoreSelector = <T,>(input: {
  store: ReadStore<EngineState>
  read: (state: EngineState) => T
  isEqual?: Equality<T>
}): ReadStore<T> => createDerivedStore({
  get: () => input.read(read(input.store)),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const createStoreKeyedSelector = <K, T>(input: {
  store: ReadStore<EngineState>
  read: (state: EngineState, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}): KeyedReadStore<K, T> => createKeyedDerivedStore({
  get: key => input.read(read(input.store), key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})

export const selectDocument = <T,>(input: {
  store: Store
  read: (document: DataDoc) => T
  isEqual?: Equality<T>
}) => createStoreSelector({
  store: input.store,
  read: state => input.read(state.doc),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const selectDocumentById = <K, T>(input: {
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
