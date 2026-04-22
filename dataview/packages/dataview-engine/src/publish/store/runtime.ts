import type { CalculationCollection } from '@dataview/core/calculation'
import {
  document as documentApi
} from '@dataview/core/document'
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
  ActiveChange,
  DocumentChange,
  EntityChange,
  ItemChange,
  ItemValue,
  SectionChange,
  SummaryChange
} from '@dataview/engine/contracts/change'
import type {
  EngineResult,
  EngineSnapshot
} from '@dataview/engine/contracts/core'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  ActiveSource,
  DocumentSource,
  EngineSource,
  SectionSource
} from '@dataview/engine/contracts/source'
import { EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP } from '@dataview/engine/contracts/view'
import type {
  ItemId,
  ItemPlacement,
  Section,
  SectionKey
} from '@dataview/engine/contracts/shared'

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

const createEntitySourceRuntime = <K, T>(emptyIds: readonly K[] = [] as readonly K[]) => {
  const ids = store.createValueStore<readonly K[]>({
    initial: emptyIds,
    isEqual: equal.sameOrder
  })
  const values = store.createKeyedStore<K, T | undefined>({
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

const createSectionSourceRuntime = () => {
  const keys = store.createValueStore<readonly SectionKey[]>({
    initial: EMPTY_SECTION_KEYS,
    isEqual: equal.sameOrder
  })
  const values = store.createKeyedStore<SectionKey, Section | undefined>({
    emptyValue: undefined
  })
  const summary = store.createKeyedStore<SectionKey, CalculationCollection | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      keys,
      summary,
      get: values.get,
      subscribe: values.subscribe,
      isEqual: values.isEqual
    } satisfies SectionSource,
    keys,
    values,
    summary,
    clear: () => {
      keys.set(EMPTY_SECTION_KEYS)
      values.clear()
      summary.clear()
    }
  }
}

const createItemSourceRuntime = () => {
  const ids = store.createValueStore<readonly ItemId[]>({
    initial: EMPTY_ITEM_IDS,
    isEqual: equal.sameOrder
  })
  const record = store.createKeyedStore<ItemId, RecordId | undefined>({
    emptyValue: undefined
  })
  const section = store.createKeyedStore<ItemId, SectionKey | undefined>({
    emptyValue: undefined
  })
  const placement = store.createKeyedStore<ItemId, ItemPlacement | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      ids,
      read: {
        record,
        section,
        placement
      }
    } satisfies ActiveSource['items'],
    ids,
    record,
    section,
    placement,
    clear: () => {
      ids.set(EMPTY_ITEM_IDS)
      record.clear()
      section.clear()
      placement.clear()
    }
  }
}

const applyEntityChange = <K, T>(runtime: {
  ids?: store.ValueStore<readonly K[]>
  values: store.KeyedStore<K, T | undefined>
}, change: EntityChange<K, T> | undefined) => {
  if (!change) {
    return
  }

  if (change.ids && runtime.ids) {
    runtime.ids.set(change.ids)
  }

  if (!change.set && !change.remove?.length) {
    return
  }

  runtime.values.patch({
    ...(change.set
      ? {
          set: change.set
        }
      : {}),
    ...(change.remove?.length
      ? {
          delete: change.remove
        }
      : {})
  })
}

const applySectionChange = (
  runtime: ReturnType<typeof createSectionSourceRuntime>,
  change: SectionChange | undefined
) => {
  if (!change) {
    return
  }

  if (change.keys) {
    runtime.keys.set(change.keys)
  }

  if (!change.set && !change.remove?.length) {
    return
  }

  runtime.values.patch({
    ...(change.set
      ? {
          set: change.set
        }
      : {}),
    ...(change.remove?.length
      ? {
          delete: change.remove
        }
      : {})
  })
}

const applySummaryChange = (
  runtime: ReturnType<typeof createSectionSourceRuntime>,
  change: SummaryChange | undefined
) => {
  if (!change) {
    return
  }

  runtime.summary.patch({
    ...(change.set
      ? {
          set: change.set
        }
      : {}),
    ...(change.remove?.length
      ? {
          delete: change.remove
        }
      : {})
  })
}

const applyItemChange = (
  runtime: ReturnType<typeof createItemSourceRuntime>,
  change: ItemChange | undefined
) => {
  if (!change) {
    return
  }

  if (change.ids) {
    runtime.ids.set(change.ids)
  }

  const recordSet: Array<readonly [ItemId, RecordId | undefined]> = []
  const sectionSet: Array<readonly [ItemId, SectionKey | undefined]> = []
  const placementSet: Array<readonly [ItemId, ItemPlacement | undefined]> = []

  change.set?.forEach(([itemId, value]) => {
    recordSet.push([itemId, value.record])
    sectionSet.push([itemId, value.section])
    placementSet.push([itemId, value.placement])
  })

  runtime.record.patch({
    ...(recordSet.length
      ? {
          set: recordSet
        }
      : {}),
    ...(change.remove?.length
      ? {
          delete: change.remove
        }
      : {})
  })
  runtime.section.patch({
    ...(sectionSet.length
      ? {
          set: sectionSet
        }
      : {}),
    ...(change.remove?.length
      ? {
          delete: change.remove
        }
      : {})
  })
  runtime.placement.patch({
    ...(placementSet.length
      ? {
          set: placementSet
        }
      : {}),
    ...(change.remove?.length
      ? {
          delete: change.remove
        }
      : {})
  })
}

const collectSectionItemValues = (
  snapshot: ViewState
): readonly (readonly [ItemId, ItemValue])[] => {
  const pairs: Array<readonly [ItemId, ItemValue]> = []

  snapshot.sections.all.forEach(section => {
    section.itemIds.forEach(itemId => {
      const record = snapshot.items.read.record(itemId)
      const sectionKey = snapshot.items.read.section(itemId)
      const placement = snapshot.items.read.placement(itemId)
      if (!record || !sectionKey || !placement) {
        return
      }

      pairs.push([itemId, {
        record,
        section: sectionKey,
        placement
      }] as const)
    })
  })

  return pairs
}

const resetEntityRuntime = <K, T>(runtime: {
  ids: store.ValueStore<readonly K[]>
  values: store.KeyedStore<K, T | undefined>
}, input: {
  ids: readonly K[]
  values: readonly (readonly [K, T])[]
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
  resetEntityRuntime(input.records, {
    ids: documentApi.records.ids(input.snapshot.doc),
    values: documentApi.records.ids(input.snapshot.doc).flatMap(recordId => {
      const value = documentApi.records.get(input.snapshot.doc, recordId)
      return value
        ? [[recordId, value] as const]
        : []
    })
  })
  resetEntityRuntime(input.fields, {
    ids: documentApi.fields.custom.ids(input.snapshot.doc),
    values: documentApi.fields.custom.ids(input.snapshot.doc).flatMap(fieldId => {
      const value = documentApi.fields.custom.get(input.snapshot.doc, fieldId)
      return value
        ? [[fieldId, value] as const]
        : []
    })
  })
  resetEntityRuntime(input.views, {
    ids: documentApi.views.ids(input.snapshot.doc),
    values: documentApi.views.ids(input.snapshot.doc).flatMap(viewId => {
      const value = documentApi.views.get(input.snapshot.doc, viewId)
      return value
        ? [[viewId, value] as const]
        : []
    })
  })
}

const resetActiveSource = (input: {
  snapshot?: ViewState
  viewReady: store.ValueStore<boolean>
  viewId: store.ValueStore<ViewId | undefined>
  viewType: store.ValueStore<View['type'] | undefined>
  viewCurrent: store.ValueStore<View | undefined>
  query: store.ValueStore<ActiveViewQuery>
  table: store.ValueStore<ActiveViewTable>
  gallery: store.ValueStore<ActiveViewGallery>
  kanban: store.ValueStore<ActiveViewKanban>
  items: ReturnType<typeof createItemSourceRuntime>
  sections: ReturnType<typeof createSectionSourceRuntime>
  fieldsAll: ReturnType<typeof createEntitySourceRuntime<FieldId, Field>>
  fieldsCustom: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
}) => {
  const snapshot = input.snapshot
  if (!snapshot) {
    input.viewReady.set(false)
    input.viewId.set(undefined)
    input.viewType.set(undefined)
    input.viewCurrent.set(undefined)
    input.query.set(EMPTY_QUERY)
    input.table.set(EMPTY_TABLE)
    input.gallery.set(EMPTY_GALLERY)
    input.kanban.set(EMPTY_KANBAN)
    input.items.clear()
    input.sections.clear()
    input.fieldsAll.clear()
    input.fieldsCustom.clear()
    return
  }

  input.viewReady.set(true)
  input.viewId.set(snapshot.view.id)
  input.viewType.set(snapshot.view.type)
  input.viewCurrent.set(snapshot.view)
  input.query.set(snapshot.query)
  input.table.set(snapshot.table)
  input.gallery.set(snapshot.gallery)
  input.kanban.set(snapshot.kanban)
  input.items.ids.set(snapshot.items.ids)
  input.items.record.clear()
  input.items.section.clear()
  input.items.placement.clear()
  const itemValues = collectSectionItemValues(snapshot)
  if (itemValues.length) {
    input.items.record.patch({
      set: itemValues.map(([itemId, value]) => [itemId, value.record] as const)
    })
    input.items.section.patch({
      set: itemValues.map(([itemId, value]) => [itemId, value.section] as const)
    })
    input.items.placement.patch({
      set: itemValues.map(([itemId, value]) => [itemId, value.placement] as const)
    })
  }
  input.sections.keys.set(snapshot.sections.ids)
  input.sections.values.clear()
  if (snapshot.sections.all.length) {
    input.sections.values.patch({
      set: snapshot.sections.all.map(section => [section.key, section] as const)
    })
  }
  input.sections.summary.clear()
  if (snapshot.sections.ids.length) {
    input.sections.summary.patch({
      set: snapshot.sections.ids.flatMap(sectionKey => {
        const summary = snapshot.summaries.get(sectionKey)
        return summary
          ? [[sectionKey, summary] as const]
          : []
      })
    })
  }
  resetEntityRuntime(input.fieldsAll, {
    ids: snapshot.fields.ids,
    values: snapshot.fields.all.map(field => [field.id, field] as const)
  })
  resetEntityRuntime(input.fieldsCustom, {
    ids: snapshot.fields.custom.map(field => field.id),
    values: snapshot.fields.custom.map(field => [field.id, field] as const)
  })
}

const applyDocumentChange = (input: {
  change: DocumentChange | undefined
  records: ReturnType<typeof createEntitySourceRuntime<RecordId, DataRecord>>
  fields: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
  views: ReturnType<typeof createEntitySourceRuntime<ViewId, View>>
}) => {
  if (!input.change) {
    return
  }

  applyEntityChange(input.records, input.change.records)
  applyEntityChange(input.fields, input.change.fields)
  applyEntityChange(input.views, input.change.views)
}

const applyActiveChange = (input: {
  change: ActiveChange | undefined
  snapshot?: ViewState
  viewReady: store.ValueStore<boolean>
  viewId: store.ValueStore<ViewId | undefined>
  viewType: store.ValueStore<View['type'] | undefined>
  viewCurrent: store.ValueStore<View | undefined>
  query: store.ValueStore<ActiveViewQuery>
  table: store.ValueStore<ActiveViewTable>
  gallery: store.ValueStore<ActiveViewGallery>
  kanban: store.ValueStore<ActiveViewKanban>
  items: ReturnType<typeof createItemSourceRuntime>
  sections: ReturnType<typeof createSectionSourceRuntime>
  fieldsAll: ReturnType<typeof createEntitySourceRuntime<FieldId, Field>>
  fieldsCustom: ReturnType<typeof createEntitySourceRuntime<FieldId, CustomField>>
}) => {
  if (!input.change) {
    return
  }

  if (input.change.reset) {
    resetActiveSource({
      snapshot: input.snapshot,
      viewReady: input.viewReady,
      viewId: input.viewId,
      viewType: input.viewType,
      viewCurrent: input.viewCurrent,
      query: input.query,
      table: input.table,
      gallery: input.gallery,
      kanban: input.kanban,
      items: input.items,
      sections: input.sections,
      fieldsAll: input.fieldsAll,
      fieldsCustom: input.fieldsCustom
    })
    return
  }

  input.viewReady.set(Boolean(input.snapshot))
  if (input.change.view?.id !== undefined) {
    input.viewId.set(input.change.view.id)
  }
  if (input.change.view?.type !== undefined) {
    input.viewType.set(input.change.view.type)
  }
  if (input.change.view?.current !== undefined) {
    input.viewCurrent.set(input.change.view.current)
  }
  if (input.change.view?.query !== undefined) {
    input.query.set(input.change.view.query)
  }
  if (input.change.view?.table !== undefined) {
    input.table.set(input.change.view.table)
  }
  if (input.change.view?.gallery !== undefined) {
    input.gallery.set(input.change.view.gallery)
  }
  if (input.change.view?.kanban !== undefined) {
    input.kanban.set(input.change.view.kanban)
  }

  applyItemChange(input.items, input.change.items)
  applySectionChange(input.sections, input.change.sections)
  applySummaryChange(input.sections, input.change.summaries)
  applyEntityChange(input.fieldsAll, input.change.fields?.all)
  applyEntityChange(input.fieldsCustom, input.change.fields?.custom)
}

export interface EngineStoreSourceAdapter {
  source: EngineSource
  state: store.ReadStore<ViewState | undefined>
  sync: (result: EngineResult) => void
  clear: () => void
}

export const createEngineStoreSourceAdapter = (input: {
  snapshot: EngineSnapshot
}): EngineStoreSourceAdapter => {
  const documentRecords = createEntitySourceRuntime<RecordId, DataRecord>()
  const documentFields = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const documentViews = createEntitySourceRuntime<ViewId, View>()
  const activeItems = createItemSourceRuntime()
  const activeSections = createSectionSourceRuntime()
  const activeFieldsAll = createEntitySourceRuntime<FieldId, Field>(EMPTY_FIELD_IDS)
  const activeFieldsCustom = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const activeState = store.createValueStore<ViewState | undefined>(input.snapshot.active)
  const viewReady = store.createValueStore(Boolean(input.snapshot.active))
  const viewId = store.createValueStore<ViewId | undefined>(input.snapshot.active?.view.id)
  const viewType = store.createValueStore<View['type'] | undefined>(input.snapshot.active?.view.type)
  const viewCurrent = store.createValueStore<View | undefined>(input.snapshot.active?.view)
  const query = store.createValueStore<ActiveViewQuery>(input.snapshot.active?.query ?? EMPTY_QUERY)
  const table = store.createValueStore<ActiveViewTable>(input.snapshot.active?.table ?? EMPTY_TABLE)
  const gallery = store.createValueStore<ActiveViewGallery>(input.snapshot.active?.gallery ?? EMPTY_GALLERY)
  const kanban = store.createValueStore<ActiveViewKanban>(input.snapshot.active?.kanban ?? EMPTY_KANBAN)

  const source: EngineSource = {
    doc: {
      records: documentRecords.source,
      fields: documentFields.source,
      views: documentViews.source
    } satisfies DocumentSource,
    active: {
      view: {
        ready: viewReady,
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
      items: activeItems.source,
      sections: activeSections.source,
      fields: {
        all: activeFieldsAll.source,
        custom: activeFieldsCustom.source
      }
    } satisfies ActiveSource
  }

  resetDocumentSource({
    snapshot: input.snapshot,
    records: documentRecords,
    fields: documentFields,
    views: documentViews
  })
  resetActiveSource({
    snapshot: input.snapshot.active,
    viewReady,
    viewId,
    viewType,
    viewCurrent,
    query,
    table,
    gallery,
    kanban,
    items: activeItems,
    sections: activeSections,
    fieldsAll: activeFieldsAll,
    fieldsCustom: activeFieldsCustom
  })

  return {
    source,
    state: activeState,
    sync: result => {
      store.batch(() => {
        applyDocumentChange({
          change: result.change?.doc,
          records: documentRecords,
          fields: documentFields,
          views: documentViews
        })
        applyActiveChange({
          change: result.change?.active,
          snapshot: result.snapshot.active,
          viewReady,
          viewId,
          viewType,
          viewCurrent,
          query,
          table,
          gallery,
          kanban,
          items: activeItems,
          sections: activeSections,
          fieldsAll: activeFieldsAll,
          fieldsCustom: activeFieldsCustom
        })
        activeState.set(result.snapshot.active)
      })
    },
    clear: () => {
      store.batch(() => {
        documentRecords.clear()
        documentFields.clear()
        documentViews.clear()
        resetActiveSource({
          snapshot: undefined,
          viewReady,
          viewId,
          viewType,
          viewCurrent,
          query,
          table,
          gallery,
          kanban,
          items: activeItems,
          sections: activeSections,
          fieldsAll: activeFieldsAll,
          fieldsCustom: activeFieldsCustom
        })
        activeState.set(undefined)
      })
    }
  }
}
