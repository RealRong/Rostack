import type {
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  DataDoc,
  CustomField,
  CustomFieldId,
  Field,
  FieldId,
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
  getDocumentFieldById,
  getDocumentRecordById,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'
import {
  createDerivedStore,
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
  ActiveEngineApi,
  ActiveSelectApi,
  ActiveViewReadApi,
  ActiveViewState,
  EngineReadApi
} from '../api/public'
import type {
  AppearanceList,
  FieldList,
  SectionKey
} from '../project/readModels'
import {
  readSectionRecordIds,
  toRecordField
} from '../project'
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

const sameActiveState = (
  left: ActiveViewState | undefined,
  right: ActiveViewState | undefined
) => left === right || (
  !!left
  && !!right
  && left.view === right.view
  && left.filter === right.filter
  && left.group === right.group
  && left.search === right.search
  && left.sort === right.sort
  && left.records === right.records
  && left.sections === right.sections
  && left.appearances === right.appearances
  && left.fields === right.fields
  && left.calculations === right.calculations
)

export const createReadApi = (
  store: Store
): EngineReadApi => ({
  document: selectDoc({
    store,
    read: document => document
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

const createActiveSelectApi = (
  state: ReadStore<ActiveViewState | undefined>
): ActiveSelectApi => (
  selector,
  isEqual
) => createDerivedStore({
  get: read => selector(read(state)),
  ...(isEqual ? { isEqual } : {})
})

const createActiveReadApi = (input: {
  read: EngineReadApi
  state: ReadStore<ActiveViewState | undefined>
}): ActiveViewReadApi => {
  const readDocument = () => input.read.document.get()
  const readState = () => input.state.get()

  const getField = (fieldId: FieldId): Field | undefined => (
    getDocumentFieldById(readDocument(), fieldId)
  )

  return {
    getRecord: recordId => input.read.record.get(recordId),
    getField,
    getGroupField: () => {
      const state = readState()
      if (!state?.group?.active) {
        return undefined
      }

      return state.group.field
        ?? (state.group.fieldId
          ? getField(state.group.fieldId)
          : undefined)
    },
    getFilterField: index => {
      const rule = readState()?.filter?.rules[index]
      return rule?.field
        ?? (rule?.fieldId
          ? getField(rule.fieldId)
          : undefined)
    },
    getRecordField: cell => {
      const appearances = readState()?.appearances
      return appearances
        ? toRecordField(cell, appearances) ?? undefined
        : undefined
    },
    getSectionRecordIds: section => {
      const state = readState()
      return state?.sections && state.appearances
        ? readSectionRecordIds({
            sections: state.sections,
            appearances: state.appearances
          }, section)
        : []
    }
  }
}

export const createActiveBaseApi = (input: {
  store: Store
  read: EngineReadApi
}): Pick<ActiveEngineApi, 'id' | 'view' | 'state' | 'select' | 'read'> => {
  const id = selectDoc({
    store: input.store,
    read: getDocumentActiveViewId
  })
  const view = selectDoc({
    store: input.store,
    read: getDocumentActiveView
  })
  const state = createSelector<ActiveViewState | undefined>({
    store: input.store,
    read: current => {
      const activeView = getDocumentActiveView(current.doc)
      if (!activeView) {
        return undefined
      }

      return {
        view: activeView,
        filter: current.project.filter,
        group: current.project.group,
        search: current.project.search,
        sort: current.project.sort,
        records: current.project.records,
        sections: current.project.sections,
        appearances: current.project.appearances,
        fields: current.project.fields,
        calculations: current.project.calculations as ReadonlyMap<SectionKey, CalculationCollection> | undefined
      }
    },
    isEqual: sameActiveState
  })

  return {
    id,
    view,
    state,
    select: createActiveSelectApi(state),
    read: createActiveReadApi({
      read: input.read,
      state
    })
  }
}
