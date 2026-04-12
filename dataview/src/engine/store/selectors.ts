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
  isCustomField
} from '@dataview/core/field'
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
  ActiveGalleryState,
  ActiveKanbanState,
  ActiveSelectApi,
  ActiveTableState,
  ActiveViewReadApi,
  ActiveViewState,
  EngineReadApi
} from '../api/public'
import type {
  AppearanceId,
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

const usesOptionGroupingColors = (
  field?: Pick<Field, 'kind'>
) => {
  if (!field || field.kind === 'title') {
    return false
  }

  return (
    field.kind === 'select'
    || field.kind === 'multiSelect'
    || field.kind === 'status'
  )
}

const sameCustomFields = (
  left: readonly CustomField[],
  right: readonly CustomField[]
) => left.length === right.length
  && left.every((field, index) => field === right[index])

const resolveGroupField = (
  state: ActiveViewState,
  document: DataDoc
): Field | undefined => state.group.field
  ?? (
    state.group.fieldId
      ? getDocumentFieldById(document, state.group.fieldId)
      : undefined
  )

const resolveCustomFields = (
  fields: FieldList
): readonly CustomField[] => fields.all.filter(isCustomField)

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

const sameActiveTableState = (
  left: ActiveTableState | undefined,
  right: ActiveTableState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupField === right.groupField
  && sameCustomFields(left.customFields, right.customFields)
  && sameOrder(left.visibleFieldIds, right.visibleFieldIds)
  && left.showVerticalLines === right.showVerticalLines
)

const sameActiveGalleryState = (
  left: ActiveGalleryState | undefined,
  right: ActiveGalleryState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupField === right.groupField
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && sameCustomFields(left.customFields, right.customFields)
  && left.canReorder === right.canReorder
  && left.cardSize === right.cardSize
  && sameValue(left.sections, right.sections)
)

const sameActiveKanbanState = (
  left: ActiveKanbanState | undefined,
  right: ActiveKanbanState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupField === right.groupField
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && sameCustomFields(left.customFields, right.customFields)
  && left.cardsPerColumn === right.cardsPerColumn
  && left.fillColumnColor === right.fillColumnColor
  && left.canReorder === right.canReorder
)

const readActiveState = (
  current: State
): ActiveViewState | undefined => {
  const activeView = getDocumentActiveView(current.doc)
  const filter = current.project.filter
  const group = current.project.group
  const search = current.project.search
  const sort = current.project.sort
  const records = current.project.records
  const sections = current.project.sections
  const appearances = current.project.appearances
  const fields = current.project.fields
  const calculations = current.project.calculations

  if (
    !activeView
    || !filter
    || !group
    || !search
    || !sort
    || !records
    || !sections
    || !appearances
    || !fields
    || !calculations
  ) {
    return undefined
  }

  return {
    view: activeView,
    filter,
    group,
    search,
    sort,
    records,
    sections,
    appearances,
    fields,
    calculations
  }
}

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
      if (!state || !state.group.active) {
        return undefined
      }

      return state.group.field
        ?? (state.group.fieldId
          ? getField(state.group.fieldId)
          : undefined)
    },
    getFilterField: index => {
      const rule = readState()?.filter.rules[index]
      return rule?.field
        ?? (rule?.fieldId
          ? getField(rule.fieldId)
          : undefined)
    },
    getRecordField: cell => {
      const state = readState()
      return state
        ? toRecordField(cell, state.appearances) ?? undefined
        : undefined
    },
    getSectionRecordIds: section => {
      const state = readState()
      return state
        ? readSectionRecordIds({
            sections: state.sections,
            appearances: state.appearances
          }, section)
        : []
    },
    getAppearanceRecordId: appearanceId => readState()?.appearances.get(appearanceId)?.recordId,
    getAppearanceRecord: appearanceId => {
      const recordId = readState()?.appearances.get(appearanceId)?.recordId
      return recordId
        ? input.read.record.get(recordId)
        : undefined
    },
    getAppearanceSectionKey: appearanceId => readState()?.appearances.sectionOf(appearanceId),
    getSectionColor: section => readState()?.sections.find(current => current.key === section)?.color,
    getDisplayFieldIndex: fieldId => readState()?.view.display.fields.indexOf(fieldId) ?? -1
  }
}

export const createActiveBaseApi = (input: {
  store: Store
  read: EngineReadApi
}): Pick<ActiveEngineApi, 'id' | 'view' | 'state' | 'select' | 'read'> & {
  table: Pick<ActiveEngineApi['table'], 'state'>
  gallery: Pick<ActiveEngineApi['gallery'], 'state'>
  kanban: Pick<ActiveEngineApi['kanban'], 'state'>
} => {
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
    read: readActiveState,
    isEqual: sameActiveState
  })
  const tableState = createSelector<ActiveTableState | undefined>({
    store: input.store,
    read: current => {
      const state = readActiveState(current)
      if (!state || state.view.type !== 'table') {
        return undefined
      }

      return {
        groupField: resolveGroupField(state, current.doc),
        customFields: resolveCustomFields(state.fields),
        visibleFieldIds: state.view.display.fields,
        showVerticalLines: state.view.options.table.showVerticalLines
      }
    },
    isEqual: sameActiveTableState
  })
  const galleryState = createSelector<ActiveGalleryState | undefined>({
    store: input.store,
    read: current => {
      const state = readActiveState(current)
      if (!state || state.view.type !== 'gallery') {
        return undefined
      }

      const groupField = resolveGroupField(state, current.doc)
      const groupUsesOptionColors = usesOptionGroupingColors(groupField)
      const canReorder = !state.group.active && !state.sort.active

      return {
        sections: state.group.active
          ? state.sections
          : [{
              key: 'all',
              title: '',
              color: undefined,
              collapsed: false,
              ids: state.appearances.ids
            }],
        groupField,
        groupUsesOptionColors,
        customFields: resolveCustomFields(state.fields),
        canReorder,
        cardSize: state.view.options.gallery.cardSize
      }
    },
    isEqual: sameActiveGalleryState
  })
  const kanbanState = createSelector<ActiveKanbanState | undefined>({
    store: input.store,
    read: current => {
      const state = readActiveState(current)
      if (!state || state.view.type !== 'kanban') {
        return undefined
      }

      const groupField = resolveGroupField(state, current.doc)
      const groupUsesOptionColors = usesOptionGroupingColors(groupField)

      return {
        groupField,
        groupUsesOptionColors,
        customFields: resolveCustomFields(state.fields),
        cardsPerColumn: state.view.options.kanban.cardsPerColumn,
        fillColumnColor: groupUsesOptionColors && state.view.options.kanban.fillColumnColor,
        canReorder: state.group.active && !state.sort.active
      }
    },
    isEqual: sameActiveKanbanState
  })

  return {
    id,
    view,
    state,
    select: createActiveSelectApi(state),
    read: createActiveReadApi({
      read: input.read,
      state
    }),
    table: {
      state: tableState
    },
    gallery: {
      state: galleryState
    },
    kanban: {
      state: kanbanState
    }
  }
}
