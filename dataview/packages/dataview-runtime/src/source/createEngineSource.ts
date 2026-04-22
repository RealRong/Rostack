import type { CalculationCollection } from '@dataview/core/calculation'
import { document as documentApi } from '@dataview/core/document'
import type {
  CardLayout,
  CardSize,
  CustomField,
  DataRecord,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  equal,
  store
} from '@shared/core'
import type {
  ActiveDelta,
  CollectionDelta,
  DocDelta,
  EngineDelta
} from '@dataview/engine/contracts/delta'
import type {
  EngineSnapshot
} from '@dataview/engine/contracts/core'
import { EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP } from '@dataview/engine/contracts/view'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  FieldList,
  ItemId,
  ItemPlacement,
  Section,
  SectionKey,
  ViewState
} from '@dataview/engine/contracts'
import type {
  ActiveSource,
  CreateEngineSourceInput,
  DocumentSource,
  EngineSource,
  EngineSourceRuntime,
  ItemSource,
  SectionSource
} from '@dataview/runtime/source/contracts'

interface ItemValue {
  recordId: RecordId
  sectionKey: SectionKey
  placement: ItemPlacement
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_QUERY: ActiveViewQuery = {
  search: {
    query: ''
  },
  filters: {
    rules: []
  },
  sort: {
    rules: []
  },
  group: EMPTY_GROUP
}
const EMPTY_TABLE: ActiveViewTable = {
  wrap: false,
  showVerticalLines: false,
  calc: new Map()
}
const EMPTY_GALLERY: ActiveViewGallery = {
  wrap: false,
  size: 'medium' as CardSize,
  layout: 'vertical' as CardLayout,
  canReorder: false,
  groupUsesOptionColors: false
}
const EMPTY_KANBAN: ActiveViewKanban = {
  wrap: false,
  size: 'medium' as CardSize,
  layout: 'vertical' as CardLayout,
  canReorder: false,
  groupUsesOptionColors: false,
  fillColumnColor: false,
  cardsPerColumn: 0 as KanbanCardsPerColumn
}

const createEntitySourceRuntime = <Key, Value>(
  emptyIds: readonly Key[] = [] as readonly Key[]
) => {
  const ids = store.createValueStore<readonly Key[]>({
    initial: emptyIds,
    isEqual: equal.sameOrder
  })
  const values = store.createKeyedStore<Key, Value | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      ids,
      get: values.get,
      subscribe: values.subscribe,
      isEqual: values.isEqual
    },
    ids,
    values,
    clear: () => {
      ids.set(emptyIds)
      values.clear()
    }
  }
}

const createRecordListStore = () => store.createValueStore<readonly RecordId[]>({
  initial: EMPTY_RECORD_IDS,
  isEqual: equal.sameOrder
})

const createSectionSourceRuntime = () => {
  const ids = store.createValueStore<readonly SectionKey[]>({
    initial: EMPTY_SECTION_KEYS,
    isEqual: equal.sameOrder
  })
  const values = store.createKeyedStore<SectionKey, Section | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      ids,
      get: values.get,
      subscribe: values.subscribe,
      isEqual: values.isEqual
    } satisfies SectionSource,
    ids,
    values,
    clear: () => {
      ids.set(EMPTY_SECTION_KEYS)
      values.clear()
    }
  }
}

const createSummarySourceRuntime = () => {
  const values = store.createKeyedStore<SectionKey, CalculationCollection | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      get: values.get,
      subscribe: values.subscribe,
      isEqual: values.isEqual
    },
    values,
    clear: () => {
      values.clear()
    }
  }
}

const createItemSourceRuntime = () => {
  const ids = store.createValueStore<readonly ItemId[]>({
    initial: EMPTY_ITEM_IDS,
    isEqual: equal.sameOrder
  })
  const table = store.createKeyTableStore<ItemId, ItemValue>()
  const recordId = table.project.field(value => value?.recordId)
  const sectionKey = table.project.field(value => value?.sectionKey)
  const placement = table.project.field(value => value?.placement)

  return {
    source: {
      ids,
      read: {
        recordId,
        sectionKey,
        placement
      }
    } satisfies ItemSource,
    ids,
    table,
    clear: () => {
      ids.set(EMPTY_ITEM_IDS)
      table.write.clear()
    }
  }
}

const readItemValue = (
  snapshot: ViewState,
  itemId: ItemId
): ItemValue | undefined => {
  const recordId = snapshot.items.read.record(itemId)
  const sectionKey = snapshot.items.read.section(itemId)
  const placement = snapshot.items.read.placement(itemId)
  if (!recordId || !sectionKey || !placement) {
    return undefined
  }

  return {
    recordId,
    sectionKey,
    placement
  }
}

const collectSectionItemValues = (
  snapshot: ViewState
): readonly (readonly [ItemId, ItemValue])[] => {
  const pairs: Array<readonly [ItemId, ItemValue]> = []

  snapshot.sections.all.forEach(section => {
    section.itemIds.forEach(itemId => {
      const value = readItemValue(snapshot, itemId)
      if (!value) {
        return
      }

      pairs.push([itemId, value] as const)
    })
  })

  return pairs
}

const resetEntityRuntime = <Key, Value>(runtime: {
  ids: store.ValueStore<readonly Key[]>
  values: store.KeyedStore<Key, Value | undefined>
}, input: {
  ids: readonly Key[]
  values: readonly (readonly [Key, Value])[]
}) => {
  runtime.ids.set(input.ids)
  runtime.values.clear()
  if (!input.values.length) {
    return
  }

  runtime.values.patch({
    set: input.values
  })
}

const resetDocumentSource = (input: {
  snapshot: EngineSnapshot
  records: ReturnType<typeof createEntitySourceRuntime<RecordId, DataRecord>>
  fields: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
  views: ReturnType<typeof createEntitySourceRuntime<ViewId, View>>
}) => {
  const recordIds = documentApi.records.ids(input.snapshot.doc)
  const fieldIds = documentApi.fields.custom.ids(input.snapshot.doc)
  const viewIds = documentApi.views.ids(input.snapshot.doc)

  resetEntityRuntime(input.records, {
    ids: recordIds,
    values: recordIds.flatMap(recordId => {
      const value = documentApi.records.get(input.snapshot.doc, recordId)
      return value
        ? [[recordId, value] as const]
        : []
    })
  })
  resetEntityRuntime(input.fields, {
    ids: fieldIds,
    values: fieldIds.flatMap(fieldId => {
      const value = documentApi.fields.custom.get(input.snapshot.doc, fieldId)
      return value
        ? [[fieldId, value] as const]
        : []
    })
  })
  resetEntityRuntime(input.views, {
    ids: viewIds,
    values: viewIds.flatMap(viewId => {
      const value = documentApi.views.get(input.snapshot.doc, viewId)
      return value
        ? [[viewId, value] as const]
        : []
    })
  })
}

const resetActiveFields = (input: {
  fieldsAll: ReturnType<typeof createEntitySourceRuntime<FieldId, Field>>
  fieldsCustom: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
  fields: FieldList
}) => {
  resetEntityRuntime(input.fieldsAll, {
    ids: input.fields.ids,
    values: input.fields.all.map(field => [field.id, field] as const)
  })
  resetEntityRuntime(input.fieldsCustom, {
    ids: input.fields.custom.map(field => field.id),
    values: input.fields.custom.map(field => [field.id, field] as const)
  })
}

const resetActiveSource = (input: {
  snapshot?: ViewState
  viewId: store.ValueStore<ViewId | undefined>
  viewType: store.ValueStore<View['type'] | undefined>
  viewCurrent: store.ValueStore<View | undefined>
  query: store.ValueStore<ActiveViewQuery>
  table: store.ValueStore<ActiveViewTable>
  gallery: store.ValueStore<ActiveViewGallery>
  kanban: store.ValueStore<ActiveViewKanban>
  recordsMatched: store.ValueStore<readonly RecordId[]>
  recordsOrdered: store.ValueStore<readonly RecordId[]>
  recordsVisible: store.ValueStore<readonly RecordId[]>
  items: ReturnType<typeof createItemSourceRuntime>
  sections: ReturnType<typeof createSectionSourceRuntime>
  summaries: ReturnType<typeof createSummarySourceRuntime>
  fieldsAll: ReturnType<typeof createEntitySourceRuntime<FieldId, Field>>
  fieldsCustom: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
}) => {
  const snapshot = input.snapshot
  if (!snapshot) {
    input.viewId.set(undefined)
    input.viewType.set(undefined)
    input.viewCurrent.set(undefined)
    input.query.set(EMPTY_QUERY)
    input.table.set(EMPTY_TABLE)
    input.gallery.set(EMPTY_GALLERY)
    input.kanban.set(EMPTY_KANBAN)
    input.recordsMatched.set(EMPTY_RECORD_IDS)
    input.recordsOrdered.set(EMPTY_RECORD_IDS)
    input.recordsVisible.set(EMPTY_RECORD_IDS)
    input.items.clear()
    input.sections.clear()
    input.summaries.clear()
    input.fieldsAll.clear()
    input.fieldsCustom.clear()
    return
  }

  input.viewId.set(snapshot.view.id)
  input.viewType.set(snapshot.view.type)
  input.viewCurrent.set(snapshot.view)
  input.query.set(snapshot.query)
  input.table.set(snapshot.table)
  input.gallery.set(snapshot.gallery)
  input.kanban.set(snapshot.kanban)
  input.recordsMatched.set(snapshot.records.matched)
  input.recordsOrdered.set(snapshot.records.ordered)
  input.recordsVisible.set(snapshot.records.visible)
  input.items.ids.set(snapshot.items.ids)
  input.items.table.write.clear()
  const itemValues = collectSectionItemValues(snapshot)
  if (itemValues.length) {
    input.items.table.write.apply({
      set: itemValues
    })
  }
  input.sections.ids.set(snapshot.sections.ids)
  input.sections.values.clear()
  if (snapshot.sections.all.length) {
    input.sections.values.patch({
      set: snapshot.sections.all.map(section => [section.key, section] as const)
    })
  }
  input.summaries.values.clear()
  if (snapshot.sections.ids.length) {
    input.summaries.values.patch({
      set: snapshot.sections.ids.flatMap(sectionKey => {
        const summary = snapshot.summaries.get(sectionKey)
        return summary
          ? [[sectionKey, summary] as const]
          : []
      })
    })
  }
  resetActiveFields({
    fieldsAll: input.fieldsAll,
    fieldsCustom: input.fieldsCustom,
    fields: snapshot.fields
  })
}

const applyEntityDelta = <Key, Value>(input: {
  delta: CollectionDelta<Key> | undefined
  runtime: {
    ids?: store.ValueStore<readonly Key[]>
    values: store.KeyedStore<Key, Value | undefined>
  }
  readIds: () => readonly Key[]
  readValue: (key: Key) => Value | undefined
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.list && input.runtime.ids) {
    input.runtime.ids.set(input.readIds())
  }

  const set = input.delta.update?.flatMap(key => {
    const value = input.readValue(key)
    return value === undefined
      ? []
      : [[key, value] as const]
  })

  if (!set?.length && !input.delta.remove?.length) {
    return
  }

  input.runtime.values.patch({
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(input.delta.remove?.length
      ? {
          delete: input.delta.remove
        }
      : {})
  })
}

const applyItemDelta = (input: {
  delta: CollectionDelta<ItemId> | undefined
  runtime: ReturnType<typeof createItemSourceRuntime>
  snapshot: ViewState
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.list) {
    input.runtime.ids.set(input.snapshot.items.ids)
  }

  const set = input.delta.update?.flatMap(itemId => {
    const value = readItemValue(input.snapshot, itemId)
    return value
      ? [[itemId, value] as const]
      : []
  })

  if (!set?.length && !input.delta.remove?.length) {
    return
  }

  input.runtime.table.write.apply({
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(input.delta.remove?.length
      ? {
          remove: input.delta.remove
        }
      : {})
  })
}

const applyDocumentDelta = (input: {
  delta: DocDelta | undefined
  snapshot: EngineSnapshot
  records: ReturnType<typeof createEntitySourceRuntime<RecordId, DataRecord>>
  fields: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
  views: ReturnType<typeof createEntitySourceRuntime<ViewId, View>>
}) => {
  if (!input.delta) {
    return
  }

  applyEntityDelta({
    delta: input.delta.records,
    runtime: input.records,
    readIds: () => documentApi.records.ids(input.snapshot.doc),
    readValue: recordId => documentApi.records.get(input.snapshot.doc, recordId)
  })
  applyEntityDelta({
    delta: input.delta.fields,
    runtime: input.fields,
    readIds: () => documentApi.fields.custom.ids(input.snapshot.doc),
    readValue: fieldId => documentApi.fields.custom.get(input.snapshot.doc, fieldId)
  })
  applyEntityDelta({
    delta: input.delta.views,
    runtime: input.views,
    readIds: () => documentApi.views.ids(input.snapshot.doc),
    readValue: viewId => documentApi.views.get(input.snapshot.doc, viewId)
  })
}

const applyActiveDelta = (input: {
  delta: ActiveDelta | undefined
  snapshot?: ViewState
  viewId: store.ValueStore<ViewId | undefined>
  viewType: store.ValueStore<View['type'] | undefined>
  viewCurrent: store.ValueStore<View | undefined>
  query: store.ValueStore<ActiveViewQuery>
  table: store.ValueStore<ActiveViewTable>
  gallery: store.ValueStore<ActiveViewGallery>
  kanban: store.ValueStore<ActiveViewKanban>
  recordsMatched: store.ValueStore<readonly RecordId[]>
  recordsOrdered: store.ValueStore<readonly RecordId[]>
  recordsVisible: store.ValueStore<readonly RecordId[]>
  items: ReturnType<typeof createItemSourceRuntime>
  sections: ReturnType<typeof createSectionSourceRuntime>
  summaries: ReturnType<typeof createSummarySourceRuntime>
  fieldsAll: ReturnType<typeof createEntitySourceRuntime<FieldId, Field>>
  fieldsCustom: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.reset) {
    resetActiveSource(input)
    return
  }

  const snapshot = input.snapshot
  if (!snapshot) {
    return
  }

  if (input.delta.view) {
    input.viewId.set(snapshot.view.id)
    input.viewType.set(snapshot.view.type)
    input.viewCurrent.set(snapshot.view)
  }

  if (input.delta.meta?.query) {
    input.query.set(snapshot.query)
  }
  if (input.delta.meta?.table) {
    input.table.set(snapshot.table)
  }
  if (input.delta.meta?.gallery) {
    input.gallery.set(snapshot.gallery)
  }
  if (input.delta.meta?.kanban) {
    input.kanban.set(snapshot.kanban)
  }

  if (input.delta.records?.matched) {
    input.recordsMatched.set(snapshot.records.matched)
  }
  if (input.delta.records?.ordered) {
    input.recordsOrdered.set(snapshot.records.ordered)
  }
  if (input.delta.records?.visible) {
    input.recordsVisible.set(snapshot.records.visible)
  }

  applyItemDelta({
    delta: input.delta.items,
    runtime: input.items,
    snapshot
  })
  applyEntityDelta({
    delta: input.delta.sections,
    runtime: input.sections,
    readIds: () => snapshot.sections.ids,
    readValue: sectionKey => snapshot.sections.get(sectionKey)
  })
  applyEntityDelta({
    delta: input.delta.summaries,
    runtime: {
      values: input.summaries.values
    },
    readIds: () => snapshot.sections.ids,
    readValue: sectionKey => snapshot.summaries.get(sectionKey)
  })
  applyEntityDelta({
    delta: input.delta.fields?.all,
    runtime: input.fieldsAll,
    readIds: () => snapshot.fields.ids,
    readValue: fieldId => snapshot.fields.get(fieldId)
  })
  applyEntityDelta({
    delta: input.delta.fields?.custom,
    runtime: input.fieldsCustom,
    readIds: () => snapshot.fields.custom.map(field => field.id),
    readValue: fieldId => snapshot.fields.get(fieldId) as CustomField | undefined
  })
}

const syncRuntime = (input: {
  delta: EngineDelta | undefined
  snapshot: EngineSnapshot
  records: ReturnType<typeof createEntitySourceRuntime<RecordId, DataRecord>>
  fields: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
  views: ReturnType<typeof createEntitySourceRuntime<ViewId, View>>
  viewId: store.ValueStore<ViewId | undefined>
  viewType: store.ValueStore<View['type'] | undefined>
  viewCurrent: store.ValueStore<View | undefined>
  query: store.ValueStore<ActiveViewQuery>
  table: store.ValueStore<ActiveViewTable>
  gallery: store.ValueStore<ActiveViewGallery>
  kanban: store.ValueStore<ActiveViewKanban>
  recordsMatched: store.ValueStore<readonly RecordId[]>
  recordsOrdered: store.ValueStore<readonly RecordId[]>
  recordsVisible: store.ValueStore<readonly RecordId[]>
  items: ReturnType<typeof createItemSourceRuntime>
  sections: ReturnType<typeof createSectionSourceRuntime>
  summaries: ReturnType<typeof createSummarySourceRuntime>
  fieldsAll: ReturnType<typeof createEntitySourceRuntime<FieldId, Field>>
  fieldsCustom: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
}) => {
  store.batch(() => {
    applyDocumentDelta({
      delta: input.delta?.doc,
      snapshot: input.snapshot,
      records: input.records,
      fields: input.fields,
      views: input.views
    })
    applyActiveDelta({
      delta: input.delta?.active,
      snapshot: input.snapshot.active,
      viewId: input.viewId,
      viewType: input.viewType,
      viewCurrent: input.viewCurrent,
      query: input.query,
      table: input.table,
      gallery: input.gallery,
      kanban: input.kanban,
      recordsMatched: input.recordsMatched,
      recordsOrdered: input.recordsOrdered,
      recordsVisible: input.recordsVisible,
      items: input.items,
      sections: input.sections,
      summaries: input.summaries,
      fieldsAll: input.fieldsAll,
      fieldsCustom: input.fieldsCustom
    })
  })
}

export const createEngineSource = (
  input: CreateEngineSourceInput
): EngineSourceRuntime => {
  const snapshot = input.core.read.snapshot()
  const documentRecords = createEntitySourceRuntime<RecordId, DataRecord>()
  const documentFields = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const documentViews = createEntitySourceRuntime<ViewId, View>()
  const activeItems = createItemSourceRuntime()
  const activeSections = createSectionSourceRuntime()
  const activeSummaries = createSummarySourceRuntime()
  const activeFieldsAll = createEntitySourceRuntime<FieldId, Field>(EMPTY_FIELD_IDS)
  const activeFieldsCustom = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const viewId = store.createValueStore<ViewId | undefined>(undefined)
  const viewType = store.createValueStore<View['type'] | undefined>(undefined)
  const viewCurrent = store.createValueStore<View | undefined>(undefined)
  const query = store.createValueStore<ActiveViewQuery>(EMPTY_QUERY)
  const table = store.createValueStore<ActiveViewTable>(EMPTY_TABLE)
  const gallery = store.createValueStore<ActiveViewGallery>(EMPTY_GALLERY)
  const kanban = store.createValueStore<ActiveViewKanban>(EMPTY_KANBAN)
  const recordsMatched = createRecordListStore()
  const recordsOrdered = createRecordListStore()
  const recordsVisible = createRecordListStore()

  const source: EngineSource = {
    doc: {
      records: documentRecords.source,
      fields: documentFields.source,
      views: documentViews.source
    } satisfies DocumentSource,
    active: {
      view: {
        id: viewId,
        type: viewType,
        current: viewCurrent
      },
      meta: {
        query,
        table,
        gallery,
        kanban
      },
      records: {
        matched: recordsMatched,
        ordered: recordsOrdered,
        visible: recordsVisible
      },
      items: activeItems.source,
      sections: activeSections.source,
      summaries: activeSummaries.source,
      fields: {
        all: activeFieldsAll.source,
        custom: activeFieldsCustom.source
      }
    } satisfies ActiveSource
  }

  const reset = (nextSnapshot: EngineSnapshot) => {
    store.batch(() => {
      resetDocumentSource({
        snapshot: nextSnapshot,
        records: documentRecords,
        fields: documentFields,
        views: documentViews
      })
      resetActiveSource({
        snapshot: nextSnapshot.active,
        viewId,
        viewType,
        viewCurrent,
        query,
        table,
        gallery,
        kanban,
        recordsMatched,
        recordsOrdered,
        recordsVisible,
        items: activeItems,
        sections: activeSections,
        summaries: activeSummaries,
        fieldsAll: activeFieldsAll,
        fieldsCustom: activeFieldsCustom
      })
    })
  }

  const clear = () => {
    store.batch(() => {
      documentRecords.clear()
      documentFields.clear()
      documentViews.clear()
      resetActiveSource({
        snapshot: undefined,
        viewId,
        viewType,
        viewCurrent,
        query,
        table,
        gallery,
        kanban,
        recordsMatched,
        recordsOrdered,
        recordsVisible,
        items: activeItems,
        sections: activeSections,
        summaries: activeSummaries,
        fieldsAll: activeFieldsAll,
        fieldsCustom: activeFieldsCustom
      })
    })
  }

  reset(snapshot)

  const unsubscribe = input.core.subscribe(result => {
    syncRuntime({
      delta: result.delta,
      snapshot: result.snapshot,
      records: documentRecords,
      fields: documentFields,
      views: documentViews,
      viewId,
      viewType,
      viewCurrent,
      query,
      table,
      gallery,
      kanban,
      recordsMatched,
      recordsOrdered,
      recordsVisible,
      items: activeItems,
      sections: activeSections,
      summaries: activeSummaries,
      fieldsAll: activeFieldsAll,
      fieldsCustom: activeFieldsCustom
    })
  })

  return {
    source,
    dispose: () => {
      unsubscribe()
      clear()
    }
  }
}
