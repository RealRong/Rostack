import type { CalculationCollection } from '@dataview/core/calculation'
import {
  getDocumentCustomFieldById,
  getDocumentCustomFieldIds,
  getDocumentRecordById,
  getDocumentRecordIds,
  getDocumentViewById,
  getDocumentViewIds
} from '@dataview/core/document'
import type {
  CardLayout,
  CardSize,
  CalculationMetric,
  DataDoc,
  Field,
  FieldId,
  FilterRule,
  KanbanCardsPerColumn,
  SortDirection,
  Sorter,
  View
} from '@dataview/core/contracts'
import {
  createKeyedStore,
  createValueStore,
  read,
  sameOptionalOrder,
  sameOrder,
  type KeyedStore
} from '@shared/core'
import type {
  ActivePatch,
  ActiveSource,
  DocumentPatch,
  DocumentSource,
  EMPTY_VIEW_GROUP_PROJECTION,
  EnginePatch,
  EngineSource,
  FilterRuleProjection,
  GalleryState,
  KanbanState,
  SectionSource,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '@dataview/engine/contracts/public'
import type {
  CustomField,
  DataRecord,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId,
  Section,
  SectionKey,
  ViewItem
} from '@dataview/engine/contracts/shared'
import type {
  RuntimeStore
} from '@dataview/engine/runtime/store'
import { EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP } from '@dataview/engine/contracts/public'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_VIEW_IDS = [] as readonly ViewId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_FILTERS = { rules: [] as readonly FilterRuleProjection[] } satisfies ViewFilterProjection
const EMPTY_SORT = { rules: [] } satisfies ViewSortProjection
const EMPTY_SEARCH = { query: '' } satisfies ViewSearchProjection
const DEFAULT_CARD_LAYOUT = 'vertical' as CardLayout
const DEFAULT_CARD_SIZE = 'medium' as CardSize
const DEFAULT_KANBAN_CARDS_PER_COLUMN = 0 as KanbanCardsPerColumn

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

const getFilterFieldId = (
  rule: Pick<FilterRule, 'fieldId'>
): FieldId | undefined => typeof rule.fieldId === 'string'
  ? rule.fieldId
  : undefined

const getSorterFieldId = (
  sorter: Pick<Sorter, 'field'>
): FieldId | undefined => typeof sorter.field === 'string'
  ? sorter.field
  : undefined

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
  const itemIds = createKeyedStore<SectionKey, readonly ItemId[] | undefined>({
    emptyValue: undefined,
    isEqual: sameOptionalOrder
  })
  const summary = createKeyedStore<SectionKey, CalculationCollection | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      keys,
      itemIds,
      summary,
      get: values.get,
      subscribe: values.subscribe,
      isEqual: values.isEqual
    } satisfies SectionSource,
    keys,
    values,
    itemIds,
    summary,
    clear: () => {
      keys.set(EMPTY_SECTION_KEYS)
      values.clear()
      itemIds.clear()
      summary.clear()
    }
  }
}

const mergeDeleteKeys = <K,>(
  extra: readonly K[],
  patchDelete?: Iterable<K>
) => {
  const merged = new Set<K>(extra)
  if (patchDelete) {
    for (const key of patchDelete) {
      merged.add(key)
    }
  }

  return merged.size
    ? [...merged]
    : undefined
}

const collectMissingKeys = <K,>(
  current: ReadonlyMap<K, unknown>,
  nextIds: readonly K[]
) => {
  const nextIdSet = new Set(nextIds)
  const missing: K[] = []
  current.forEach((_, key) => {
    if (!nextIdSet.has(key)) {
      missing.push(key)
    }
  })
  return missing
}

const applyScopedKeyedPatch = <K, T>(
  store: KeyedStore<K, T | undefined>,
  patch: {
    set?: Iterable<readonly [K, T | undefined]>
    delete?: Iterable<K>
  } | undefined,
  scopeIds?: readonly K[]
) => {
  if (!patch && !scopeIds) {
    return
  }

  const deleteKeys = mergeDeleteKeys(
    scopeIds
      ? collectMissingKeys(store.all(), scopeIds)
      : [],
    patch?.delete
  )

  if (!patch?.set && !deleteKeys?.length) {
    return
  }

  store.patch({
    ...(patch?.set ? { set: patch.set } : {}),
    ...(deleteKeys?.length ? { delete: deleteKeys } : {})
  })
}

const createSetEntries = <K, T>(
  ids: readonly K[],
  getValue: (id: K) => T | undefined
) => ids.map(id => [id, getValue(id)] as const)

const createDocumentPatch = (
  document: DataDoc
): DocumentPatch => {
  const recordIds = getDocumentRecordIds(document)
  const fieldIds = getDocumentCustomFieldIds(document)
  const viewIds = getDocumentViewIds(document)

  return {
    records: {
      ids: recordIds,
      values: {
        set: createSetEntries(recordIds, id => getDocumentRecordById(document, id))
      }
    },
    fields: {
      ids: fieldIds,
      values: {
        set: createSetEntries(fieldIds, id => getDocumentCustomFieldById(document, id))
      }
    },
    views: {
      ids: viewIds,
      values: {
        set: createSetEntries(viewIds, id => getDocumentViewById(document, id))
      }
    }
  }
}

const resolveGalleryState = (
  view: View | undefined,
  query: {
    group: ViewGroupProjection
    sort: ViewSortProjection
  } | undefined
): GalleryState => {
  if (!view || view.type !== 'gallery' || !query) {
    return {
      groupUsesOptionColors: false,
      canReorder: false,
      card: {
        wrap: false,
        size: DEFAULT_CARD_SIZE,
        layout: DEFAULT_CARD_LAYOUT
      }
    }
  }

  return {
    groupUsesOptionColors: usesOptionGroupingColors(query.group.field),
    canReorder: !query.group.active && query.sort.rules.length === 0,
    card: {
      wrap: view.options.gallery.card.wrap,
      size: view.options.gallery.card.size,
      layout: view.options.gallery.card.layout
    }
  }
}

const resolveKanbanState = (
  view: View | undefined,
  query: {
    group: ViewGroupProjection
    sort: ViewSortProjection
  } | undefined
): KanbanState => {
  if (!view || view.type !== 'kanban' || !query) {
    return {
      groupUsesOptionColors: false,
      card: {
        wrap: false,
        size: DEFAULT_CARD_SIZE,
        layout: DEFAULT_CARD_LAYOUT
      },
      cardsPerColumn: DEFAULT_KANBAN_CARDS_PER_COLUMN,
      fillColumnColor: false,
      canReorder: false
    }
  }

  const groupUsesOptionColors = usesOptionGroupingColors(query.group.field)

  return {
    groupUsesOptionColors,
    card: {
      wrap: view.options.kanban.card.wrap,
      size: view.options.kanban.card.size,
      layout: view.options.kanban.card.layout
    },
    cardsPerColumn: view.options.kanban.cardsPerColumn,
    fillColumnColor: groupUsesOptionColors && view.options.kanban.fillColumnColor,
    canReorder: query.group.active && query.sort.rules.length === 0
  }
}

const createActivePatch = (
  document: DataDoc,
  snapshot: import('@dataview/engine/contracts/public').ViewState | undefined
): ActivePatch => {
  const activeViewId = document.activeViewId
  const activeView = activeViewId
    ? getDocumentViewById(document, activeViewId)
    : undefined

  if (!snapshot || !activeView) {
    return {
      view: {
        ready: false,
        id: activeViewId,
        type: activeView?.type,
        value: activeView
      },
      items: {
        ids: EMPTY_ITEM_IDS,
        values: {
          set: []
        },
        index: {
          set: []
        }
      },
      sections: {
        keys: EMPTY_SECTION_KEYS,
        values: {
          set: []
        },
        itemIds: {
          set: []
        },
        summary: {
          set: []
        }
      },
      fields: {
        all: {
          ids: EMPTY_FIELD_IDS,
          values: {
            set: []
          }
        },
        custom: {
          ids: EMPTY_FIELD_IDS,
          values: {
            set: []
          }
        }
      },
      query: {
        search: EMPTY_SEARCH,
        filters: EMPTY_FILTERS,
        sort: EMPTY_SORT,
        group: EMPTY_GROUP,
        grouped: false,
        groupFieldId: '',
        filterFieldIds: EMPTY_FIELD_IDS,
        sortFieldIds: EMPTY_FIELD_IDS,
        sortDir: {
          set: []
        }
      },
      table: {
        wrap: false,
        showVerticalLines: false,
        calc: {
          set: []
        }
      },
      gallery: {
        wrap: false,
        size: DEFAULT_CARD_SIZE,
        layout: DEFAULT_CARD_LAYOUT,
        canReorder: false,
        groupUsesOptionColors: false
      },
      kanban: {
        wrap: false,
        size: DEFAULT_CARD_SIZE,
        layout: DEFAULT_CARD_LAYOUT,
        canReorder: false,
        groupUsesOptionColors: false,
        fillColumnColor: false,
        cardsPerColumn: DEFAULT_KANBAN_CARDS_PER_COLUMN
      }
    }
  }

  const itemIds = snapshot.items.ids
  const sectionKeys = snapshot.sections.ids
  const fieldIds = snapshot.fields.ids
  const customFieldIds = snapshot.fields.custom.map(field => field.id)
  const filterFieldIds = snapshot.query.filters.rules.flatMap(entry => {
    const fieldId = getFilterFieldId(entry.rule)
    return fieldId ? [fieldId] : []
  })
  const sortFieldIds = snapshot.query.sort.rules.flatMap(entry => {
    const fieldId = getSorterFieldId(entry.sorter)
    return fieldId ? [fieldId] : []
  })
  const gallery = resolveGalleryState(snapshot.view, snapshot.query)
  const kanban = resolveKanbanState(snapshot.view, snapshot.query)

  return {
    view: {
      ready: true,
      id: snapshot.view.id,
      type: snapshot.view.type,
      value: snapshot.view
    },
    items: {
      ids: itemIds,
      values: {
        set: createSetEntries(itemIds, id => snapshot.items.get(id))
      },
      index: {
        set: itemIds.map((id, index) => [id, index] as const)
      }
    },
    sections: {
      keys: sectionKeys,
      values: {
        set: createSetEntries(sectionKeys, key => snapshot.sections.get(key))
      },
      itemIds: {
        set: sectionKeys.map(key => [key, snapshot.sections.get(key)?.items.ids] as const)
      },
      summary: {
        set: sectionKeys.map(key => [key, snapshot.summaries.get(key)] as const)
      }
    },
    fields: {
      all: {
        ids: fieldIds,
        values: {
          set: createSetEntries(fieldIds, id => snapshot.fields.get(id))
        }
      },
      custom: {
        ids: customFieldIds,
        values: {
          set: snapshot.fields.custom.map(field => [field.id, field] as const)
        }
      }
    },
    query: {
      search: snapshot.query.search,
      filters: snapshot.query.filters,
      sort: snapshot.query.sort,
      group: snapshot.query.group,
      grouped: snapshot.query.group.active,
      groupFieldId: snapshot.query.group.fieldId,
      filterFieldIds,
      sortFieldIds,
      sortDir: {
        set: snapshot.query.sort.rules.flatMap(entry => {
          const fieldId = getSorterFieldId(entry.sorter)
          return fieldId
            ? [[fieldId, entry.sorter.direction] as const]
            : []
        })
      }
    },
    table: {
      wrap: snapshot.view.type === 'table'
        ? snapshot.view.options.table.wrap
        : false,
      showVerticalLines: snapshot.view.type === 'table'
        ? snapshot.view.options.table.showVerticalLines
        : false,
      calc: {
        set: fieldIds.map(fieldId => [fieldId, snapshot.view.type === 'table'
          ? snapshot.view.calc[fieldId] ?? undefined
          : undefined] as const)
      }
    },
    gallery: {
      wrap: gallery.card.wrap,
      size: gallery.card.size,
      layout: gallery.card.layout,
      canReorder: gallery.canReorder,
      groupUsesOptionColors: gallery.groupUsesOptionColors
    },
    kanban: {
      wrap: kanban.card.wrap,
      size: kanban.card.size,
      layout: kanban.card.layout,
      canReorder: kanban.canReorder,
      groupUsesOptionColors: kanban.groupUsesOptionColors,
      fillColumnColor: kanban.fillColumnColor,
      cardsPerColumn: kanban.cardsPerColumn
    }
  }
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
  const itemIndex = createKeyedStore<ItemId, number | undefined>({
    emptyValue: undefined
  })
  const tableWrap = createValueStore(false)
  const tableShowVerticalLines = createValueStore(false)
  const tableCalc = createKeyedStore<FieldId, CalculationMetric | undefined>({
    emptyValue: undefined
  })
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
      items: {
        ...activeItems.source,
        index: itemIndex
      },
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
        calc: tableCalc
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

  const applyDocumentPatch = (patch: DocumentPatch | undefined) => {
    if (!patch) {
      return
    }

    if (patch.records) {
      if (patch.records.ids) {
        documentRecords.ids.set(patch.records.ids)
      }
      applyScopedKeyedPatch(
        documentRecords.values,
        patch.records.values,
        patch.records.ids ?? read(documentRecords.ids)
      )
    }

    if (patch.fields) {
      if (patch.fields.ids) {
        documentFields.ids.set(patch.fields.ids)
      }
      applyScopedKeyedPatch(
        documentFields.values,
        patch.fields.values,
        patch.fields.ids ?? read(documentFields.ids)
      )
    }

    if (patch.views) {
      if (patch.views.ids) {
        documentViews.ids.set(patch.views.ids)
      }
      applyScopedKeyedPatch(
        documentViews.values,
        patch.views.values,
        patch.views.ids ?? read(documentViews.ids)
      )
    }
  }

  const applyActivePatch = (patch: ActivePatch | undefined) => {
    if (!patch) {
      return
    }

    if (patch.view) {
      if (patch.view.ready !== undefined) {
        viewReady.set(patch.view.ready)
      }
      if ('id' in patch.view) {
        viewId.set(patch.view.id)
      }
      if ('type' in patch.view) {
        viewType.set(patch.view.type)
      }
      if ('value' in patch.view) {
        viewCurrent.set(patch.view.value)
      }
    }

    if (patch.items) {
      if (patch.items.ids) {
        activeItems.ids.set(patch.items.ids)
      }
      applyScopedKeyedPatch(
        activeItems.values,
        patch.items.values,
        patch.items.ids ?? read(activeItems.ids)
      )
      applyScopedKeyedPatch(
        itemIndex,
        patch.items.index,
        patch.items.ids ?? read(activeItems.ids)
      )
    }

    if (patch.sections) {
      if (patch.sections.keys) {
        activeSections.keys.set(patch.sections.keys)
      }
      const sectionKeys = patch.sections.keys ?? read(activeSections.keys)
      applyScopedKeyedPatch(activeSections.values, patch.sections.values, sectionKeys)
      applyScopedKeyedPatch(activeSections.itemIds, patch.sections.itemIds, sectionKeys)
      applyScopedKeyedPatch(activeSections.summary, patch.sections.summary, sectionKeys)
    }

    if (patch.fields?.all) {
      if (patch.fields.all.ids) {
        activeFieldsAll.ids.set(patch.fields.all.ids)
      }
      applyScopedKeyedPatch(
        activeFieldsAll.values,
        patch.fields.all.values,
        patch.fields.all.ids ?? read(activeFieldsAll.ids)
      )
    }

    if (patch.fields?.custom) {
      if (patch.fields.custom.ids) {
        activeFieldsCustom.ids.set(patch.fields.custom.ids)
      }
      applyScopedKeyedPatch(
        activeFieldsCustom.values,
        patch.fields.custom.values,
        patch.fields.custom.ids ?? read(activeFieldsCustom.ids)
      )
    }

    if (patch.query) {
      if (patch.query.search) {
        querySearch.set(patch.query.search)
      }
      if (patch.query.filters) {
        queryFilters.set(patch.query.filters)
      }
      if (patch.query.sort) {
        querySort.set(patch.query.sort)
      }
      if (patch.query.group) {
        queryGroup.set(patch.query.group)
      }
      if (patch.query.grouped !== undefined) {
        queryGrouped.set(patch.query.grouped)
      }
      if (patch.query.groupFieldId !== undefined) {
        queryGroupFieldId.set(patch.query.groupFieldId)
      }
      if (patch.query.filterFieldIds) {
        queryFilterFieldIds.set(patch.query.filterFieldIds)
      }
      if (patch.query.sortFieldIds) {
        querySortFieldIds.set(patch.query.sortFieldIds)
      }
      applyScopedKeyedPatch(
        querySortDir,
        patch.query.sortDir,
        read(querySortFieldIds)
      )
    }

    if (patch.table) {
      if (patch.table.wrap !== undefined) {
        tableWrap.set(patch.table.wrap)
      }
      if (patch.table.showVerticalLines !== undefined) {
        tableShowVerticalLines.set(patch.table.showVerticalLines)
      }
      applyScopedKeyedPatch(
        tableCalc,
        patch.table.calc,
        read(activeFieldsAll.ids)
      )
    }

    if (patch.gallery) {
      if (patch.gallery.wrap !== undefined) {
        galleryWrap.set(patch.gallery.wrap)
      }
      if (patch.gallery.size !== undefined) {
        gallerySize.set(patch.gallery.size)
      }
      if (patch.gallery.layout !== undefined) {
        galleryLayout.set(patch.gallery.layout)
      }
      if (patch.gallery.canReorder !== undefined) {
        galleryCanReorder.set(patch.gallery.canReorder)
      }
      if (patch.gallery.groupUsesOptionColors !== undefined) {
        galleryGroupUsesOptionColors.set(patch.gallery.groupUsesOptionColors)
      }
    }

    if (patch.kanban) {
      if (patch.kanban.wrap !== undefined) {
        kanbanWrap.set(patch.kanban.wrap)
      }
      if (patch.kanban.size !== undefined) {
        kanbanSize.set(patch.kanban.size)
      }
      if (patch.kanban.layout !== undefined) {
        kanbanLayout.set(patch.kanban.layout)
      }
      if (patch.kanban.canReorder !== undefined) {
        kanbanCanReorder.set(patch.kanban.canReorder)
      }
      if (patch.kanban.groupUsesOptionColors !== undefined) {
        kanbanGroupUsesOptionColors.set(patch.kanban.groupUsesOptionColors)
      }
      if (patch.kanban.fillColumnColor !== undefined) {
        kanbanFillColumnColor.set(patch.kanban.fillColumnColor)
      }
      if (patch.kanban.cardsPerColumn !== undefined) {
        kanbanCardsPerColumn.set(patch.kanban.cardsPerColumn)
      }
    }
  }

  const apply = (patch: EnginePatch) => {
    applyDocumentPatch(patch.doc)
    applyActivePatch(patch.active)
  }

  const clear = () => {
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
    itemIndex.clear()
    tableWrap.set(false)
    tableShowVerticalLines.set(false)
    tableCalc.clear()
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
  }

  const sync = () => {
    const state = input.store.get()
    apply({
      doc: createDocumentPatch(state.doc),
      active: createActivePatch(state.doc, state.currentView.snapshot)
    })
  }

  sync()
  input.store.subscribe(sync)

  return {
    source,
    apply,
    clear
  }
}
