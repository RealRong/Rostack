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
  ActiveEngineApi,
  ActiveGalleryState,
  ActiveKanbanState,
  ActiveSelectApi,
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
  group: Pick<ActiveViewState['group'], 'field' | 'fieldId'>,
  document: DataDoc
): Field | undefined => group.field
  ?? (
    group.fieldId
      ? getDocumentFieldById(document, group.fieldId)
      : undefined
  )

const resolveCustomFields = (
  fields: FieldList
): readonly CustomField[] => fields.all.filter(isCustomField)

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
  && left.filter === right.filter
  && left.group === right.group
  && left.groupField === right.groupField
  && left.search === right.search
  && left.sort === right.sort
  && left.records === right.records
  && left.sections === right.sections
  && left.appearances === right.appearances
  && left.fields === right.fields
  && sameCustomFields(left.customFields, right.customFields)
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
  && sameValue(left.sections, right.sections)
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

  const groupField = resolveGroupField(group, current.doc)
  const customFields = resolveCustomFields(fields)

  return {
    view: activeView,
    filter,
    group,
    groupField,
    search,
    sort,
    records,
    sections,
    appearances,
    fields,
    customFields,
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
}): ActiveViewReadApi => {
  const readDocument = () => read(input.read.document)
  const readState = () => read(input.state)

  const getField = (fieldId: FieldId): Field | undefined => (
    getDocumentFieldById(readDocument(), fieldId)
  )

  return {
    getRecord: recordId => read(input.read.record, recordId),
    getField,
    getGroupField: () => {
      const state = readState()
      if (!state || !state.group.active) {
        return undefined
      }

      return state.groupField
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
        ? read(input.read.record, recordId)
        : undefined
    },
    getAppearanceSectionKey: appearanceId => readState()?.appearances.sectionOf(appearanceId),
    getSectionColor: section => readState()?.sections.find(current => current.key === section)?.color,
    getAppearanceColor: appearanceId => {
      const state = readState()
      const section = state?.appearances.sectionOf(appearanceId)
      return section
        ? state?.sections.find(current => current.key === section)?.color
        : undefined
    },
    getDisplayFieldIndex: fieldId => readState()?.view.display.fields.indexOf(fieldId) ?? -1
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

      const groupField = state.groupField
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

      const groupField = state.groupField
      const groupUsesOptionColors = usesOptionGroupingColors(groupField)

      return {
        groupUsesOptionColors,
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
    gallery: {
      state: galleryState
    },
    kanban: {
      state: kanbanState
    }
  }
}
