import type {
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  RecordId,
  Row,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentActiveView,
  getDocumentActiveViewId,
  getDocumentCustomFieldById,
  getDocumentCustomFields,
  getDocumentRecordById,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'
import {
  createKeyedReadStore,
  createReadStore,
  type Equality,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import {
  sameOrder,
  sameValue
} from '@shared/core'
import type {
  EngineProjectApi,
  EngineReadApi
} from '../api/public'
import type {
  AppearanceList,
  FieldList,
  SectionKey
} from '../project/readModels'
import type {
  State,
  Store
} from './state'

const createSelector = <T,>(input: {
  store: Store
  read: (state: State) => T
  isEqual?: Equality<T>
}): ReadStore<T> => {
  const isEqual = input.isEqual ?? sameValue
  const listeners = new Set<() => void>()
  let current = input.read(input.store.get())
  let unsubscribeBase = () => {}

  const sync = () => {
    const next = input.read(input.store.get())
    if (isEqual(current, next)) {
      current = next
      return
    }

    current = next
    Array.from(listeners).forEach(listener => {
      listener()
    })
  }

  return createReadStore({
    get: () => input.read(input.store.get()),
    subscribe: listener => {
      listeners.add(listener)
      if (listeners.size === 1) {
        current = input.read(input.store.get())
        unsubscribeBase = input.store.sub(sync)
      }

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          unsubscribeBase()
          unsubscribeBase = () => {}
        }
      }
    },
    isEqual
  })
}

const createKeyedSelector = <K, T>(input: {
  store: Store
  read: (state: State, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}): KeyedReadStore<K, T> => {
  const cache = new Map<unknown, ReadStore<T>>()

  const resolveStore = (key: K): ReadStore<T> => {
    const cacheKey = input.keyOf ? input.keyOf(key) : key
    const cached = cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const store = createSelector({
      store: input.store,
      read: state => input.read(state, key),
      ...(input.isEqual ? { isEqual: input.isEqual } : {})
    })
    cache.set(cacheKey, store)
    return store
  }

  return createKeyedReadStore({
    get: key => input.read(input.store.get(), key),
    subscribe: (key, listener) => resolveStore(key).subscribe(listener),
    ...(input.isEqual ? { isEqual: input.isEqual } : {})
  })
}

const selectDoc = <T,>(input: {
  store: Store
  read: (document: DataDoc) => T
  isEqual?: Equality<T>
}) => createSelector({
  store: input.store,
  read: state => input.read(state.doc),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

const selectDocById = <K, T>(input: {
  store: Store
  read: (document: DataDoc, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}) => createKeyedSelector({
  store: input.store,
  read: (state, key: K) => input.read(state.doc, key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})

const selectProject = <T,>(input: {
  store: Store
  read: (project: State['project']) => T
  isEqual?: Equality<T>
}) => createSelector({
  store: input.store,
  read: state => input.read(state.project),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

export const createReadApi = (
  store: Store
): EngineReadApi => ({
  document: selectDoc({
    store,
    read: document => document
  }),
  activeViewId: selectDoc({
    store,
    read: getDocumentActiveViewId
  }),
  activeView: selectDoc({
    store,
    read: getDocumentActiveView
  }),
  recordIds: selectDoc<readonly RecordId[]>({
    store,
    read: document => document.records.order,
    isEqual: sameOrder
  }),
  record: selectDocById({
    store,
    read: getDocumentRecordById
  }),
  customFieldIds: selectDoc<readonly CustomFieldId[]>({
    store,
    read: document => document.fields.order,
    isEqual: sameOrder
  }),
  customFields: selectDoc<readonly CustomField[]>({
    store,
    read: getDocumentCustomFields,
    isEqual: sameOrder
  }),
  customField: selectDocById({
    store,
    read: getDocumentCustomFieldById
  }),
  viewIds: selectDoc<readonly ViewId[]>({
    store,
    read: document => document.views.order,
    isEqual: sameOrder
  }),
  views: selectDoc<readonly View[]>({
    store,
    read: getDocumentViews,
    isEqual: sameOrder
  }),
  view: selectDocById<ViewId, View | undefined>({
    store,
    read: getDocumentViewById
  })
})

export const createProjectApi = (
  store: Store
): EngineProjectApi => ({
  view: selectProject({
    store,
    read: project => project.view
  }),
  filter: selectProject({
    store,
    read: project => project.filter
  }),
  group: selectProject({
    store,
    read: project => project.group
  }),
  search: selectProject({
    store,
    read: project => project.search
  }),
  sort: selectProject({
    store,
    read: project => project.sort
  }),
  records: selectProject({
    store,
    read: project => project.records
  }),
  sections: selectProject({
    store,
    read: project => project.sections
  }),
  appearances: selectProject({
    store,
    read: project => project.appearances
  }),
  fields: selectProject({
    store,
    read: project => project.fields
  }),
  calculations: selectProject({
    store,
    read: project => project.calculations as ReadonlyMap<SectionKey, CalculationCollection> | undefined
  })
})
