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
} from '../types'
import type {
  AppearanceList,
  FieldList,
  SectionKey
} from '../project/model'
import type {
  State,
  Store
} from './index'

const notify = (
  listeners: ReadonlySet<() => void>
) => {
  Array.from(listeners).forEach(listener => {
    listener()
  })
}

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
    notify(listeners)
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

export const createReadApi = (
  store: Store
): EngineReadApi => ({
  document: createSelector({
    store,
    read: state => state.doc
  }),
  activeViewId: createSelector({
    store,
    read: state => getDocumentActiveViewId(state.doc)
  }),
  activeView: createSelector({
    store,
    read: state => getDocumentActiveView(state.doc)
  }),
  recordIds: createSelector<readonly RecordId[]>({
    store,
    read: state => state.doc.records.order,
    isEqual: sameOrder
  }),
  record: createKeyedSelector({
    store,
    read: (state, recordId: RecordId) => getDocumentRecordById(state.doc, recordId)
  }),
  customFieldIds: createSelector<readonly CustomFieldId[]>({
    store,
    read: state => state.doc.fields.order,
    isEqual: sameOrder
  }),
  customFields: createSelector<readonly CustomField[]>({
    store,
    read: state => getDocumentCustomFields(state.doc),
    isEqual: sameOrder
  }),
  customField: createKeyedSelector({
    store,
    read: (state, fieldId: CustomFieldId) => getDocumentCustomFieldById(state.doc, fieldId)
  }),
  viewIds: createSelector<readonly ViewId[]>({
    store,
    read: state => state.doc.views.order,
    isEqual: sameOrder
  }),
  views: createSelector<readonly View[]>({
    store,
    read: state => getDocumentViews(state.doc),
    isEqual: sameOrder
  }),
  view: createKeyedSelector<ViewId, View | undefined>({
    store,
    read: (state, viewId: ViewId) => getDocumentViewById(state.doc, viewId)
  })
})

export const createProjectApi = (
  store: Store
): EngineProjectApi => ({
  view: createSelector({
    store,
    read: state => state.project.view
  }),
  filter: createSelector({
    store,
    read: state => state.project.filter
  }),
  group: createSelector({
    store,
    read: state => state.project.group
  }),
  search: createSelector({
    store,
    read: state => state.project.search
  }),
  sort: createSelector({
    store,
    read: state => state.project.sort
  }),
  records: createSelector({
    store,
    read: state => state.project.records
  }),
  sections: createSelector({
    store,
    read: state => state.project.sections
  }),
  appearances: createSelector({
    store,
    read: state => state.project.appearances
  }),
  fields: createSelector({
    store,
    read: state => state.project.fields
  }),
  calculations: createSelector({
    store,
    read: state => state.project.calculations as ReadonlyMap<SectionKey, CalculationCollection> | undefined
  })
})
