import type { DataDoc } from '@dataview/core/contracts'
import { sameOrder, type Equality } from '@shared/core'
import type { RuntimeStore } from '#engine/runtime/store'
import { createRuntimeKeyedSelector, createRuntimeSelector } from '#engine/runtime/selectors/core'

export const selectDocument = <T,>(input: {
  store: RuntimeStore
  read: (document: DataDoc) => T
  isEqual?: Equality<T>
}) => createRuntimeSelector({
  store: input.store,
  read: state => input.read(state.doc),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const selectDocumentById = <K, T>(input: {
  store: RuntimeStore
  read: (document: DataDoc, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}) => createRuntimeKeyedSelector({
  store: input.store,
  read: (state, key: K) => input.read(state.doc, key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})

export const createDocumentEntitySelectors = <TId, T>(input: {
  store: RuntimeStore
  ids: (document: DataDoc) => readonly TId[]
  all: (document: DataDoc) => readonly T[]
  byId: (document: DataDoc, id: TId) => T | undefined
}) => ({
  ids: selectDocument<readonly TId[]>({
    store: input.store,
    read: input.ids,
    isEqual: sameOrder
  }),
  all: selectDocument<readonly T[]>({
    store: input.store,
    read: input.all,
    isEqual: sameOrder
  }),
  byId: selectDocumentById<TId, T | undefined>({
    store: input.store,
    read: input.byId
  })
})
