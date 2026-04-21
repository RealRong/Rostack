import type { CalculationCollection } from '@dataview/core/calculation'
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
  collection,
  equal,
  store
} from '@shared/core'
import type {
  ActiveSource,
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  DocumentPatch,
  DocumentSource,
  EngineSource,
  EntityPatch,
  FilterRuleProjection,
  SectionSource,
  ViewFilterProjection,
  ViewSearchProjection,
  ViewSortProjection,
  ViewState
} from '@dataview/engine/contracts'
import { EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP } from '@dataview/engine/contracts'
import type {
  ItemId,
  ItemPlacement,
  Section,
  SectionKey
} from '@dataview/engine/contracts/shared'
import type { RuntimeStore } from '@dataview/engine/runtime/store'

const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_FILTERS = { rules: [] as readonly FilterRuleProjection[] } satisfies ViewFilterProjection
const EMPTY_SORT = { rules: [] } satisfies ViewSortProjection
const EMPTY_SEARCH = { query: '' } satisfies ViewSearchProjection
const EMPTY_QUERY: ActiveViewQuery = {
  search: EMPTY_SEARCH,
  filters: EMPTY_FILTERS,
  sort: EMPTY_SORT,
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

const applyEntityDelta = <K, T>(
  runtime: {
    ids?: store.ValueStore<readonly K[]>
    values: store.KeyedStore<K, T | undefined>
  },
  delta: EntityPatch<K, T> | undefined
) => {
  if (!delta) {
    return
  }

  if (delta.ids && runtime.ids) {
    runtime.ids.set(delta.ids)
  }

  if (!delta.set && !delta.remove?.length) {
    return
  }

  runtime.values.patch({
    ...(delta.set
      ? { set: delta.set }
      : {}),
    ...(delta.remove?.length
      ? { delete: delta.remove }
      : {})
  })
}

const collectRemovedKeys = <TKey,>(
  previousIds: readonly TKey[],
  nextIds: readonly TKey[]
) => {
  if (!previousIds.length) {
    return [] as TKey[]
  }

  const nextIdSet = collection.presentSet(nextIds)
  return nextIdSet
    ? previousIds.filter(key => !nextIdSet.has(key))
    : [...previousIds]
}

const patchEntityValues = <K, T>(input: {
  runtime: store.KeyedStore<K, T | undefined>
  previousIds: readonly K[]
  nextIds: readonly K[]
  previousGet: (key: K) => T | undefined
  nextGet: (key: K) => T | undefined
}) => {
  const set: Array<readonly [K, T | undefined]> = []

  input.nextIds.forEach(key => {
    const nextValue = input.nextGet(key)
    if (nextValue === undefined || input.previousGet(key) === nextValue) {
      return
    }

    set.push([key, nextValue])
  })

  const remove = collectRemovedKeys(input.previousIds, input.nextIds)
  if (!set.length && !remove.length) {
    return
  }

  input.runtime.patch({
    ...(set.length
      ? { set }
      : {}),
    ...(remove.length
      ? { delete: remove }
      : {})
  })
}

const collectSectionItemIds = (
  sections: ViewState['sections'] | undefined
): readonly ItemId[] => {
  if (!sections?.all.length) {
    return EMPTY_ITEM_IDS
  }

  const ids: ItemId[] = []
  sections.all.forEach(section => {
    section.itemIds.forEach(itemId => {
      ids.push(itemId)
    })
  })
  return ids
}

const syncItemSource = (input: {
  runtime: ReturnType<typeof createItemSourceRuntime>
  previous?: ViewState
  next: ViewState
}) => {
  const previousSectionItemIds = collectSectionItemIds(input.previous?.sections)
  const nextSectionItemIds = collectSectionItemIds(input.next.sections)

  patchEntityValues({
    runtime: input.runtime.record,
    previousIds: previousSectionItemIds,
    nextIds: nextSectionItemIds,
    previousGet: itemId => input.previous?.items.read.record(itemId),
    nextGet: itemId => input.next.items.read.record(itemId)
  })
  patchEntityValues({
    runtime: input.runtime.section,
    previousIds: previousSectionItemIds,
    nextIds: nextSectionItemIds,
    previousGet: itemId => input.previous?.items.read.section(itemId),
    nextGet: itemId => input.next.items.read.section(itemId)
  })
  patchEntityValues({
    runtime: input.runtime.placement,
    previousIds: previousSectionItemIds,
    nextIds: nextSectionItemIds,
    previousGet: itemId => input.previous?.items.read.placement(itemId),
    nextGet: itemId => input.next.items.read.placement(itemId)
  })

  input.runtime.ids.set(input.next.items.ids)
}

const collectFieldIds = <T extends { id: FieldId }>(
  fields: readonly T[] | undefined
): readonly FieldId[] => fields?.length
  ? fields.map(field => field.id)
  : EMPTY_FIELD_IDS

const syncEntityList = <K, T>(input: {
  runtime: {
    ids?: store.ValueStore<readonly K[]>
    values: store.KeyedStore<K, T | undefined>
  }
  previousIds: readonly K[]
  nextIds: readonly K[]
  previousGet: (key: K) => T | undefined
  nextGet: (key: K) => T | undefined
}) => {
  if (input.runtime.ids) {
    input.runtime.ids.set(input.nextIds)
  }

  patchEntityValues({
    runtime: input.runtime.values,
    previousIds: input.previousIds,
    nextIds: input.nextIds,
    previousGet: input.previousGet,
    nextGet: input.nextGet
  })
}

const syncActiveSnapshot = (input: {
  previous?: ViewState
  next?: ViewState
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
  const previous = input.previous
  const next = input.next

  if (!next) {
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
  input.viewId.set(next.view.id)
  input.viewType.set(next.view.type)
  input.viewCurrent.set(next.view)
  input.query.set(next.query)
  input.table.set(next.table)
  input.gallery.set(next.gallery)
  input.kanban.set(next.kanban)
  syncItemSource({
    runtime: input.items,
    previous,
    next
  })

  syncEntityList({
    runtime: {
      ids: input.sections.keys,
      values: input.sections.values
    },
    previousIds: previous?.sections.ids ?? EMPTY_SECTION_KEYS,
    nextIds: next.sections.ids,
    previousGet: sectionKey => previous?.sections.get(sectionKey),
    nextGet: sectionKey => next.sections.get(sectionKey)
  })

  patchEntityValues({
    runtime: input.sections.summary,
    previousIds: previous?.sections.ids ?? EMPTY_SECTION_KEYS,
    nextIds: next.sections.ids,
    previousGet: sectionKey => previous?.summaries.get(sectionKey),
    nextGet: sectionKey => next.summaries.get(sectionKey)
  })

  const previousAllFieldIds = collectFieldIds(previous?.fields.all)
  const nextAllFieldIds = collectFieldIds(next.fields.all)
  syncEntityList({
    runtime: input.fieldsAll,
    previousIds: previousAllFieldIds,
    nextIds: nextAllFieldIds,
    previousGet: fieldId => previous?.fields.get(fieldId),
    nextGet: fieldId => next.fields.get(fieldId)
  })

  const previousCustomFieldIds = collectFieldIds(previous?.fields.custom)
  const nextCustomFieldIds = collectFieldIds(next.fields.custom)
  syncEntityList({
    runtime: input.fieldsCustom,
    previousIds: previousCustomFieldIds,
    nextIds: nextCustomFieldIds,
    previousGet: fieldId => previous?.fields.get(fieldId) as CustomField | undefined,
    nextGet: fieldId => next.fields.get(fieldId) as CustomField | undefined
  })
}

export const createEngineSourceRuntime = (input: {
  store: RuntimeStore
}) => {
  const documentRecords = createEntitySourceRuntime<RecordId, DataRecord>()
  const documentFields = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const documentViews = createEntitySourceRuntime<ViewId, View>()
  const activeItems = createItemSourceRuntime()
  const activeSections = createSectionSourceRuntime()
  const activeFieldsAll = createEntitySourceRuntime<FieldId, Field>(EMPTY_FIELD_IDS)
  const activeFieldsCustom = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const viewReady = store.createValueStore(false)
  const viewId = store.createValueStore<ViewId | undefined>(undefined)
  const viewType = store.createValueStore<View['type'] | undefined>(undefined)
  const viewCurrent = store.createValueStore<View | undefined>(undefined)
  const query = store.createValueStore<ActiveViewQuery>(EMPTY_QUERY)
  const table = store.createValueStore<ActiveViewTable>(EMPTY_TABLE)
  const gallery = store.createValueStore<ActiveViewGallery>(EMPTY_GALLERY)
  const kanban = store.createValueStore<ActiveViewKanban>(EMPTY_KANBAN)

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

  let previousSnapshot: ViewState | undefined

  const applyDocumentPatch = (patch: DocumentPatch | undefined) => {
    if (!patch) {
      return
    }

    applyEntityDelta(documentRecords, patch.records)
    applyEntityDelta(documentFields, patch.fields)
    applyEntityDelta(documentViews, patch.views)
  }

  const sync = () => {
    const state = input.store.get()

    store.batch(() => {
      applyDocumentPatch(state.documentPatch)
      syncActiveSnapshot({
        previous: previousSnapshot,
        next: state.currentView.snapshot,
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
    })

    previousSnapshot = state.currentView.snapshot
  }

  sync()
  input.store.subscribe(sync)

  return {
    source,
    clear: () => {
      previousSnapshot = undefined
      store.batch(() => {
        documentRecords.clear()
        documentFields.clear()
        documentViews.clear()
        activeItems.clear()
        activeSections.clear()
        activeFieldsAll.clear()
        activeFieldsCustom.clear()
        viewReady.set(false)
        viewId.set(undefined)
        viewType.set(undefined)
        viewCurrent.set(undefined)
        query.set(EMPTY_QUERY)
        table.set(EMPTY_TABLE)
        gallery.set(EMPTY_GALLERY)
        kanban.set(EMPTY_KANBAN)
      })
    }
  }
}
