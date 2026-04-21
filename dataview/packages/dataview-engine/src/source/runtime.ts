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
import { equal, store } from '@shared/core'
import type {
  ActiveSource,
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  DocumentSource,
  EngineSource,
  EntityDelta,
  FilterRuleProjection,
  SectionSource,
  SourceDelta,
  ViewFilterProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '@dataview/engine/contracts'
import { EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP } from '@dataview/engine/contracts'
import type {
  ItemId,
  Section,
  SectionKey,
  ViewItem
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

const applyEntityDelta = <K, T>(
  runtime: {
    ids?: store.ValueStore<readonly K[]>
    values: store.KeyedStore<K, T | undefined>
  },
  delta: EntityDelta<K, T> | undefined
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

export const createEngineSourceRuntime = (input: {
  store: RuntimeStore
}) => {
  const documentRecords = createEntitySourceRuntime<RecordId, DataRecord>()
  const documentFields = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const documentViews = createEntitySourceRuntime<ViewId, View>()
  const activeItems = createEntitySourceRuntime<ItemId, ViewItem>(EMPTY_ITEM_IDS)
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
      items: activeItems.source,
      sections: activeSections.source,
      fields: {
        all: activeFieldsAll.source,
        custom: activeFieldsCustom.source
      },
      query,
      table,
      gallery,
      kanban
    } satisfies ActiveSource
  }

  const applyDocumentDelta = (delta: SourceDelta['document']) => {
    if (!delta) {
      return
    }

    applyEntityDelta(documentRecords, delta.records)
    applyEntityDelta(documentFields, delta.fields)
    applyEntityDelta(documentViews, delta.views)
  }

  const applyActiveDelta = (delta: SourceDelta['active']) => {
    if (!delta) {
      return
    }

    if (delta.view) {
      if (delta.view.ready !== undefined) {
        viewReady.set(delta.view.ready)
      }
      if ('id' in delta.view) {
        viewId.set(delta.view.id)
      }
      if ('type' in delta.view) {
        viewType.set(delta.view.type)
      }
      if ('value' in delta.view) {
        viewCurrent.set(delta.view.value)
      }
    }

    applyEntityDelta(activeItems, delta.items)
    applyEntityDelta({
      ids: activeSections.keys,
      values: activeSections.values
    }, delta.sections?.records)
    applyEntityDelta({
      values: activeSections.summary
    }, delta.sections?.summary)
    applyEntityDelta(activeFieldsAll, delta.fields?.all)
    applyEntityDelta(activeFieldsCustom, delta.fields?.custom)

    if (delta.query) {
      query.set(delta.query)
    }
    if (delta.table) {
      table.set(delta.table)
    }
    if (delta.gallery) {
      gallery.set(delta.gallery)
    }
    if (delta.kanban) {
      kanban.set(delta.kanban)
    }
  }

  const apply = (delta: SourceDelta) => {
    store.batch(() => {
      applyDocumentDelta(delta.document)
      applyActiveDelta(delta.active)
    })
  }

  const clear = () => {
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

  const sync = () => {
    apply(input.store.get().currentView.sourceDelta)
  }

  sync()
  input.store.subscribe(sync)

  return {
    source,
    apply,
    clear
  }
}
