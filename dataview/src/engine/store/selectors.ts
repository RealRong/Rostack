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
  DataRecord,
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
  createKeyedDerivedStore,
  read,
  type Equality,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import {
  sameOrder,
  sameValue
} from '@shared/core'
import type {
  ActiveCell,
  ActiveEngineApi,
  ActiveGalleryState,
  ActiveKanbanState,
  ActiveQuery,
  ActiveReadApi,
  ActiveSelectApi,
  ActiveViewState,
  EngineReadApi
} from '../api/public'
import type {
  AppearanceId,
  SectionKey
} from '../project/readModels'
import type { Placement } from '../project'
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

const createSelector = <T,>(input: {
  store: ReadStore<State>
  read: (state: State) => T
  isEqual?: Equality<T>
}): ReadStore<T> => createDerivedStore({
  get: () => input.read(read(input.store)),
  ...(input.isEqual ? { isEqual: input.isEqual } : {})
})

const createKeyedSelector = <K, T>(input: {
  store: ReadStore<State>
  read: (state: State, key: K) => T
  isEqual?: Equality<T>
  keyOf?: (key: K) => unknown
}): KeyedReadStore<K, T> => createKeyedDerivedStore({
  get: (key) => input.read(read(input.store), key),
  ...(input.isEqual ? { isEqual: input.isEqual } : {}),
  ...(input.keyOf ? { keyOf: input.keyOf } : {})
})

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
  && left.query === right.query
  && left.records === right.records
  && left.sections === right.sections
  && left.appearances === right.appearances
  && left.fields === right.fields
  && left.calculations === right.calculations
)

const sameActiveGalleryState = (
  left: ActiveGalleryState | undefined,
  right: ActiveGalleryState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.canReorder === right.canReorder
  && left.cardSize === right.cardSize
)

const sameActiveKanbanState = (
  left: ActiveKanbanState | undefined,
  right: ActiveKanbanState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
  && left.fillColumnColor === right.fillColumnColor
  && left.canReorder === right.canReorder
)

const readActiveState = (
  current: State
): ActiveViewState | undefined => {
  const activeView = getDocumentActiveView(current.doc)
  const query = current.project.query
  const records = current.project.records
  const sections = current.project.sections
  const appearances = current.project.appearances
  const fields = current.project.fields
  const calculations = current.project.calculations

  if (
    !activeView
    || !query
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
    query,
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
  get: () => selector(read(state)),
  ...(isEqual ? { isEqual } : {})
})

const createActiveReadApi = (input: {
  read: EngineReadApi
  state: ReadStore<ActiveViewState | undefined>
}): ActiveReadApi => {
  const readDocument = () => read(input.read.document)
  const readState = () => read(input.state)
  const readField = (fieldId: FieldId): Field | undefined => (
    getDocumentFieldById(readDocument(), fieldId)
  )
  const readSection = (key: SectionKey) => readState()?.sections.get(key)
  const readAppearance = (id: AppearanceId) => readState()?.appearances.get(id)
  const readCell = (cell: import('../project').CellRef): ActiveCell | undefined => {
    const state = readState()
    if (!state) {
      return undefined
    }

    const appearance = state.appearances.get(cell.appearanceId)
    if (!appearance) {
      return undefined
    }

    const record = read(input.read.record, appearance.recordId)
    if (!record) {
      return undefined
    }

    return {
      appearanceId: cell.appearanceId,
      recordId: appearance.recordId,
      fieldId: cell.fieldId,
      sectionKey: appearance.sectionKey,
      record,
      field: readField(cell.fieldId),
      value: cell.fieldId === 'title'
        ? record.title
        : record.values[cell.fieldId]
    }
  }
  const planMove = (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => {
    const state = readState()
    if (!state) {
      return {
        appearanceIds: [],
        recordIds: [],
        changed: false,
        sectionChanged: false,
        target: {
          sectionKey: target.sectionKey
        }
      }
    }

    const validIds = appearanceIds.filter(id => state.appearances.has(id))
    const movingSet = new Set(validIds)
    const section = state.sections.get(target.sectionKey)
    const sectionAppearanceIds = section?.appearanceIds ?? []
    const beforeAppearanceId = target.before && sectionAppearanceIds.includes(target.before)
      ? target.before
      : undefined
    const remaining = sectionAppearanceIds.filter(id => !movingSet.has(id))
    const index = beforeAppearanceId
      ? remaining.indexOf(beforeAppearanceId)
      : -1
    const nextBeforeAppearanceId = beforeAppearanceId && index >= 0
      ? remaining[index]
      : undefined
    const recordIds = validIds.flatMap(id => {
      const recordId = state.appearances.get(id)?.recordId
      return recordId ? [recordId] : []
    }).filter((recordId, index, source) => source.indexOf(recordId) === index)
    const beforeRecordId = nextBeforeAppearanceId
      ? state.appearances.get(nextBeforeAppearanceId)?.recordId
      : undefined
    const sectionChanged = validIds.some(id => state.appearances.get(id)?.sectionKey !== target.sectionKey)
    const changed = (
      sectionChanged
      || validIds.some((id, index) => sectionAppearanceIds.filter(current => movingSet.has(current))[index] !== id)
      || Boolean(beforeAppearanceId !== nextBeforeAppearanceId)
    ) && validIds.length > 0

    return {
      appearanceIds: validIds,
      recordIds,
      changed,
      sectionChanged,
      target: {
        sectionKey: target.sectionKey,
        ...(nextBeforeAppearanceId ? { beforeAppearanceId: nextBeforeAppearanceId } : {}),
        ...(beforeRecordId ? { beforeRecordId } : {})
      }
    }
  }

  return {
    record: recordId => read(input.read.record, recordId),
    field: readField,
    section: readSection,
    appearance: readAppearance,
    cell: readCell,
    groupField: () => {
      const state = readState()
      if (!state || !state.query.group.active) {
        return undefined
      }

      return state.query.group.field
    },
    filterField: index => {
      const rule = readState()?.query.filter.rules[index]
      return rule?.field
        ?? (rule?.fieldId
          ? readField(rule.fieldId)
          : undefined)
    },
    planMove
  }
}

export const createActiveBaseApi = (input: {
  store: Store
  read: EngineReadApi
}): Pick<ActiveEngineApi, 'id' | 'view' | 'state' | 'select' | 'read'> & {
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
  const galleryState = createSelector<ActiveGalleryState | undefined>({
    store: input.store,
    read: current => {
      const state = readActiveState(current)
      if (!state || state.view.type !== 'gallery') {
        return undefined
      }

      const groupField = state.query.group.field
      const groupUsesOptionColors = usesOptionGroupingColors(groupField)
      const canReorder = !state.query.group.active && !state.query.sort.active

      return {
        groupUsesOptionColors,
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

      const groupField = state.query.group.field
      const groupUsesOptionColors = usesOptionGroupingColors(groupField)

      return {
        groupUsesOptionColors,
        cardsPerColumn: state.view.options.kanban.cardsPerColumn,
        fillColumnColor: groupUsesOptionColors && state.view.options.kanban.fillColumnColor,
        canReorder: state.query.group.active && !state.query.sort.active
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
    gallery: {
      state: galleryState
    },
    kanban: {
      state: kanbanState
    }
  }
}
