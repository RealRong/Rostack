import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CardLayout,
  CardSize,
  CalculationMetric,
  CustomField,
  DataRecord,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  RecordId,
  SortDirection,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  batch,
  createKeyedStore,
  createValueStore,
  sameOrder,
  type KeyedStore
} from '@shared/core'
import type {
  ActiveSource,
  DocumentSource,
  EngineSource,
  EntityDelta,
  FilterRuleProjection,
  SectionSource,
  SourceDelta,
  TableLayoutState,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '@dataview/engine/contracts/public'
import { EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP } from '@dataview/engine/contracts/public'
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
const DEFAULT_CARD_LAYOUT = 'vertical' as CardLayout
const DEFAULT_CARD_SIZE = 'medium' as CardSize
const DEFAULT_KANBAN_CARDS_PER_COLUMN = 0 as KanbanCardsPerColumn

const createEntitySourceRuntime = <K, T>() => {
  const ids = createValueStore<readonly K[]>({
    initial: [] as readonly K[],
    isEqual: sameOrder
  })
  const values = createKeyedStore<K, T | undefined>({
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
      ids.set([] as readonly K[])
      values.clear()
    }
  }
}

const createSectionSourceRuntime = () => {
  const keys = createValueStore<readonly SectionKey[]>({
    initial: EMPTY_SECTION_KEYS,
    isEqual: sameOrder
  })
  const values = createKeyedStore<SectionKey, Section | undefined>({
    emptyValue: undefined
  })
  const summary = createKeyedStore<SectionKey, CalculationCollection | undefined>({
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
  store: KeyedStore<K, T | undefined>,
  delta: EntityDelta<K, T> | undefined
) => {
  if (!delta) {
    return
  }

  if (!delta.set && !delta.remove?.length) {
    return
  }

  store.patch({
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
  const documentFields = createEntitySourceRuntime<FieldId, CustomField>()
  const documentViews = createEntitySourceRuntime<ViewId, View>()
  const activeItems = createEntitySourceRuntime<ItemId, ViewItem>()
  const activeSections = createSectionSourceRuntime()
  const activeFieldsAll = createEntitySourceRuntime<FieldId, Field>()
  const activeFieldsCustom = createEntitySourceRuntime<FieldId, CustomField>()
  const viewReady = createValueStore(false)
  const viewId = createValueStore<ViewId | undefined>(undefined)
  const viewType = createValueStore<View['type'] | undefined>(undefined)
  const viewCurrent = createValueStore<View | undefined>(undefined)
  const querySearch = createValueStore<ViewSearchProjection>(EMPTY_SEARCH)
  const queryFilters = createValueStore<ViewFilterProjection>(EMPTY_FILTERS)
  const querySort = createValueStore<ViewSortProjection>(EMPTY_SORT)
  const queryGroup = createValueStore<ViewGroupProjection>(EMPTY_GROUP)
  const queryGrouped = createValueStore(false)
  const queryGroupFieldId = createValueStore<FieldId | ''>('')
  const queryFilterFieldIds = createValueStore<readonly FieldId[]>({
    initial: EMPTY_FIELD_IDS,
    isEqual: sameOrder
  })
  const querySortFieldIds = createValueStore<readonly FieldId[]>({
    initial: EMPTY_FIELD_IDS,
    isEqual: sameOrder
  })
  const querySortDir = createKeyedStore<FieldId, SortDirection | undefined>({
    emptyValue: undefined
  })
  const tableWrap = createValueStore(false)
  const tableShowVerticalLines = createValueStore(false)
  const tableCalc = createKeyedStore<FieldId, CalculationMetric | undefined>({
    emptyValue: undefined
  })
  const tableLayout = createValueStore<TableLayoutState | null>(null)
  const galleryWrap = createValueStore(false)
  const gallerySize = createValueStore<CardSize>(DEFAULT_CARD_SIZE)
  const galleryLayout = createValueStore<CardLayout>(DEFAULT_CARD_LAYOUT)
  const galleryCanReorder = createValueStore(false)
  const galleryGroupUsesOptionColors = createValueStore(false)
  const kanbanWrap = createValueStore(false)
  const kanbanSize = createValueStore<CardSize>(DEFAULT_CARD_SIZE)
  const kanbanLayout = createValueStore<CardLayout>(DEFAULT_CARD_LAYOUT)
  const kanbanCanReorder = createValueStore(false)
  const kanbanGroupUsesOptionColors = createValueStore(false)
  const kanbanFillColumnColor = createValueStore(false)
  const kanbanCardsPerColumn = createValueStore<KanbanCardsPerColumn>(
    DEFAULT_KANBAN_CARDS_PER_COLUMN
  )

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
      query: {
        search: querySearch,
        filters: queryFilters,
        sort: querySort,
        group: queryGroup,
        grouped: queryGrouped,
        groupFieldId: queryGroupFieldId,
        filterFieldIds: queryFilterFieldIds,
        sortFieldIds: querySortFieldIds,
        sortDir: querySortDir
      },
      table: {
        wrap: tableWrap,
        showVerticalLines: tableShowVerticalLines,
        calc: tableCalc,
        layout: tableLayout
      },
      gallery: {
        wrap: galleryWrap,
        size: gallerySize,
        layout: galleryLayout,
        canReorder: galleryCanReorder,
        groupUsesOptionColors: galleryGroupUsesOptionColors
      },
      kanban: {
        wrap: kanbanWrap,
        size: kanbanSize,
        layout: kanbanLayout,
        canReorder: kanbanCanReorder,
        groupUsesOptionColors: kanbanGroupUsesOptionColors,
        fillColumnColor: kanbanFillColumnColor,
        cardsPerColumn: kanbanCardsPerColumn
      }
    } satisfies ActiveSource
  }

  const applyDocumentDelta = (delta: SourceDelta['document']) => {
    if (!delta) {
      return
    }

    if (delta.records) {
      if (delta.records.ids) {
        documentRecords.ids.set(delta.records.ids)
      }
      applyEntityDelta(documentRecords.values, delta.records.values)
    }

    if (delta.fields) {
      if (delta.fields.ids) {
        documentFields.ids.set(delta.fields.ids)
      }
      applyEntityDelta(documentFields.values, delta.fields.values)
    }

    if (delta.views) {
      if (delta.views.ids) {
        documentViews.ids.set(delta.views.ids)
      }
      applyEntityDelta(documentViews.values, delta.views.values)
    }
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

    if (delta.items) {
      if (delta.items.ids) {
        activeItems.ids.set(delta.items.ids)
      }
      applyEntityDelta(activeItems.values, delta.items.values)
    }

    if (delta.sections) {
      if (delta.sections.keys) {
        activeSections.keys.set(delta.sections.keys)
      }
      applyEntityDelta(activeSections.values, delta.sections.values)
      applyEntityDelta(activeSections.summary, delta.sections.summary)
    }

    if (delta.fields?.all) {
      if (delta.fields.all.ids) {
        activeFieldsAll.ids.set(delta.fields.all.ids)
      }
      applyEntityDelta(activeFieldsAll.values, delta.fields.all.values)
    }

    if (delta.fields?.custom) {
      if (delta.fields.custom.ids) {
        activeFieldsCustom.ids.set(delta.fields.custom.ids)
      }
      applyEntityDelta(activeFieldsCustom.values, delta.fields.custom.values)
    }

    if (delta.query) {
      if (delta.query.search) {
        querySearch.set(delta.query.search)
      }
      if (delta.query.filters) {
        queryFilters.set(delta.query.filters)
      }
      if (delta.query.sort) {
        querySort.set(delta.query.sort)
      }
      if (delta.query.group) {
        queryGroup.set(delta.query.group)
      }
      if (delta.query.grouped !== undefined) {
        queryGrouped.set(delta.query.grouped)
      }
      if (delta.query.groupFieldId !== undefined) {
        queryGroupFieldId.set(delta.query.groupFieldId)
      }
      if (delta.query.filterFieldIds) {
        queryFilterFieldIds.set(delta.query.filterFieldIds)
      }
      if (delta.query.sortFieldIds) {
        querySortFieldIds.set(delta.query.sortFieldIds)
      }
      applyEntityDelta(querySortDir, delta.query.sortDir)
    }

    if (delta.table) {
      if (delta.table.wrap !== undefined) {
        tableWrap.set(delta.table.wrap)
      }
      if (delta.table.showVerticalLines !== undefined) {
        tableShowVerticalLines.set(delta.table.showVerticalLines)
      }
      applyEntityDelta(tableCalc, delta.table.calc)
      if ('layout' in delta.table) {
        tableLayout.set(delta.table.layout ?? null)
      }
    }

    if (delta.gallery) {
      if (delta.gallery.wrap !== undefined) {
        galleryWrap.set(delta.gallery.wrap)
      }
      if (delta.gallery.size !== undefined) {
        gallerySize.set(delta.gallery.size)
      }
      if (delta.gallery.layout !== undefined) {
        galleryLayout.set(delta.gallery.layout)
      }
      if (delta.gallery.canReorder !== undefined) {
        galleryCanReorder.set(delta.gallery.canReorder)
      }
      if (delta.gallery.groupUsesOptionColors !== undefined) {
        galleryGroupUsesOptionColors.set(delta.gallery.groupUsesOptionColors)
      }
    }

    if (delta.kanban) {
      if (delta.kanban.wrap !== undefined) {
        kanbanWrap.set(delta.kanban.wrap)
      }
      if (delta.kanban.size !== undefined) {
        kanbanSize.set(delta.kanban.size)
      }
      if (delta.kanban.layout !== undefined) {
        kanbanLayout.set(delta.kanban.layout)
      }
      if (delta.kanban.canReorder !== undefined) {
        kanbanCanReorder.set(delta.kanban.canReorder)
      }
      if (delta.kanban.groupUsesOptionColors !== undefined) {
        kanbanGroupUsesOptionColors.set(delta.kanban.groupUsesOptionColors)
      }
      if (delta.kanban.fillColumnColor !== undefined) {
        kanbanFillColumnColor.set(delta.kanban.fillColumnColor)
      }
      if (delta.kanban.cardsPerColumn !== undefined) {
        kanbanCardsPerColumn.set(delta.kanban.cardsPerColumn)
      }
    }
  }

  const apply = (delta: SourceDelta) => {
    batch(() => {
      applyDocumentDelta(delta.document)
      applyActiveDelta(delta.active)
    })
  }

  const clear = () => {
    batch(() => {
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
      querySearch.set(EMPTY_SEARCH)
      queryFilters.set(EMPTY_FILTERS)
      querySort.set(EMPTY_SORT)
      queryGroup.set(EMPTY_GROUP)
      queryGrouped.set(false)
      queryGroupFieldId.set('')
      queryFilterFieldIds.set(EMPTY_FIELD_IDS)
      querySortFieldIds.set(EMPTY_FIELD_IDS)
      querySortDir.clear()
      tableWrap.set(false)
      tableShowVerticalLines.set(false)
      tableCalc.clear()
      tableLayout.set(null)
      galleryWrap.set(false)
      gallerySize.set(DEFAULT_CARD_SIZE)
      galleryLayout.set(DEFAULT_CARD_LAYOUT)
      galleryCanReorder.set(false)
      galleryGroupUsesOptionColors.set(false)
      kanbanWrap.set(false)
      kanbanSize.set(DEFAULT_CARD_SIZE)
      kanbanLayout.set(DEFAULT_CARD_LAYOUT)
      kanbanCanReorder.set(false)
      kanbanGroupUsesOptionColors.set(false)
      kanbanFillColumnColor.set(false)
      kanbanCardsPerColumn.set(DEFAULT_KANBAN_CARDS_PER_COLUMN)
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
