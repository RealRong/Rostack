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
  CustomField,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  FilterRule,
  KanbanCardsPerColumn,
  RecordId,
  SortDirection,
  Sorter,
  View,
  ViewId
} from '@dataview/core/contracts'
import { sameOrder, type KeyedStorePatch } from '@shared/core'
import type {
  ActivePatch,
  DocumentPatch,
  EnginePatch,
  FilterRuleProjection,
  GalleryState,
  KanbanState,
  ViewState,
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
  ViewItem,
} from '@dataview/engine/contracts/shared'

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

const collectRemovedKeys = <TKey,>(
  previousIds: readonly TKey[],
  nextIds: readonly TKey[]
) => {
  if (!previousIds.length) {
    return undefined
  }

  const nextIdSet = new Set(nextIds)
  const removed = previousIds.filter(key => !nextIdSet.has(key))
  return removed.length
    ? removed
    : undefined
}

const createEntityPatch = <TKey, TValue>(input: {
  previousIds?: readonly TKey[]
  nextIds: readonly TKey[]
  previousValue: (key: TKey) => TValue | undefined
  nextValue: (key: TKey) => TValue | undefined
}): KeyedStorePatch<TKey, TValue | undefined> | undefined => {
  const previousIds = input.previousIds ?? []
  const nextIdSet = new Set(input.nextIds)
  const previousIdSet = new Set(previousIds)
  const set: [TKey, TValue | undefined][] = []

  for (let index = 0; index < input.nextIds.length; index += 1) {
    const key = input.nextIds[index]!
    const previousValue = input.previousValue(key)
    const nextValue = input.nextValue(key)
    if (!previousIdSet.has(key) || !Object.is(previousValue, nextValue)) {
      set.push([key, nextValue])
    }
  }

  const remove = previousIds.filter(key => !nextIdSet.has(key))
  if (!set.length && !remove.length) {
    return undefined
  }

  return {
    ...(set.length ? { set } : {}),
    ...(remove.length ? { delete: remove } : {})
  }
}

const createSortDirectionPatch = (input: {
  previous?: ViewState
  next?: ViewState
}): KeyedStorePatch<FieldId, SortDirection | undefined> | undefined => {
  const previousFieldIds = input.previous?.query.sort.rules.flatMap(entry => {
    const fieldId = getSorterFieldId(entry.sorter)
    return fieldId ? [fieldId] : []
  }) ?? EMPTY_FIELD_IDS
  const nextFieldIds = input.next?.query.sort.rules.flatMap(entry => {
    const fieldId = getSorterFieldId(entry.sorter)
    return fieldId ? [fieldId] : []
  }) ?? EMPTY_FIELD_IDS
  const previousDirections = new Map<FieldId, SortDirection>(
    input.previous?.query.sort.rules.flatMap(entry => {
      const fieldId = getSorterFieldId(entry.sorter)
      return fieldId
        ? [[fieldId, entry.sorter.direction] as const]
        : []
    }) ?? []
  )
  const nextDirections = new Map<FieldId, SortDirection>(
    input.next?.query.sort.rules.flatMap(entry => {
      const fieldId = getSorterFieldId(entry.sorter)
      return fieldId
        ? [[fieldId, entry.sorter.direction] as const]
        : []
    }) ?? []
  )

  return createEntityPatch({
    previousIds: previousFieldIds,
    nextIds: nextFieldIds,
    previousValue: fieldId => previousDirections.get(fieldId),
    nextValue: fieldId => nextDirections.get(fieldId)
  })
}

const createSectionItemIdsPatch = (input: {
  previous?: ViewState
  next?: ViewState
}): KeyedStorePatch<SectionKey, readonly ItemId[] | undefined> | undefined => {
  const previousIds = input.previous?.sections.ids ?? EMPTY_SECTION_KEYS
  const nextIds = input.next?.sections.ids ?? EMPTY_SECTION_KEYS

  return createEntityPatch({
    previousIds,
    nextIds,
    previousValue: key => input.previous?.sections.get(key)?.items.ids,
    nextValue: key => input.next?.sections.get(key)?.items.ids
  })
}

const createSectionSummaryPatch = (input: {
  previous?: ViewState
  next?: ViewState
}): KeyedStorePatch<SectionKey, CalculationCollection | undefined> | undefined => {
  const previousIds = input.previous?.sections.ids ?? EMPTY_SECTION_KEYS
  const nextIds = input.next?.sections.ids ?? EMPTY_SECTION_KEYS

  return createEntityPatch({
    previousIds,
    nextIds,
    previousValue: key => input.previous?.summaries.get(key),
    nextValue: key => input.next?.summaries.get(key)
  })
}

const createItemIndexPatch = (input: {
  previous?: ViewState
  next?: ViewState
}): KeyedStorePatch<ItemId, number | undefined> | undefined => {
  const previousIds = input.previous?.items.ids ?? EMPTY_ITEM_IDS
  const nextIds = input.next?.items.ids ?? EMPTY_ITEM_IDS
  const nextIndex = new Map<ItemId, number>()
  nextIds.forEach((itemId, index) => {
    nextIndex.set(itemId, index)
  })

  return createEntityPatch({
    previousIds,
    nextIds,
    previousValue: itemId => input.previous?.items.indexOf(itemId),
    nextValue: itemId => nextIndex.get(itemId)
  })
}

const createTableCalcPatch = (input: {
  previous?: ViewState
  next?: ViewState
}): KeyedStorePatch<FieldId, CalculationMetric | undefined> | undefined => {
  const previousIds = input.previous?.fields.ids ?? EMPTY_FIELD_IDS
  const nextIds = input.next?.fields.ids ?? EMPTY_FIELD_IDS

  return createEntityPatch({
    previousIds,
    nextIds,
    previousValue: fieldId => input.previous?.view.type === 'table'
      ? input.previous.view.calc[fieldId] ?? undefined
      : undefined,
    nextValue: fieldId => input.next?.view.type === 'table'
      ? input.next.view.calc[fieldId] ?? undefined
      : undefined
  })
}

const createDocumentPatch = (input: {
  previous?: DataDoc
  next: DataDoc
}): DocumentPatch | undefined => {
  const nextRecordIds = getDocumentRecordIds(input.next)
  const nextFieldIds = getDocumentCustomFieldIds(input.next)
  const nextViewIds = getDocumentViewIds(input.next)
  const previousRecordIds = input.previous
    ? getDocumentRecordIds(input.previous)
    : undefined
  const previousFieldIds = input.previous
    ? getDocumentCustomFieldIds(input.previous)
    : undefined
  const previousViewIds = input.previous
    ? getDocumentViewIds(input.previous)
    : undefined

  const records = {
    ...(!sameOrder(previousRecordIds ?? EMPTY_RECORD_IDS, nextRecordIds)
      ? { ids: nextRecordIds }
      : {}),
    values: createEntityPatch<RecordId, DataRecord>({
      previousIds: previousRecordIds,
      nextIds: nextRecordIds,
      previousValue: id => input.previous
        ? getDocumentRecordById(input.previous, id)
        : undefined,
      nextValue: id => getDocumentRecordById(input.next, id)
    })
  }
  const fields = {
    ...(!sameOrder(previousFieldIds ?? EMPTY_FIELD_IDS, nextFieldIds)
      ? { ids: nextFieldIds }
      : {}),
    values: createEntityPatch<FieldId, CustomField>({
      previousIds: previousFieldIds,
      nextIds: nextFieldIds,
      previousValue: id => input.previous
        ? getDocumentCustomFieldById(input.previous, id)
        : undefined,
      nextValue: id => getDocumentCustomFieldById(input.next, id)
    })
  }
  const views = {
    ...(!sameOrder(previousViewIds ?? EMPTY_VIEW_IDS, nextViewIds)
      ? { ids: nextViewIds }
      : {}),
    values: createEntityPatch<ViewId, View>({
      previousIds: previousViewIds,
      nextIds: nextViewIds,
      previousValue: id => input.previous
        ? getDocumentViewById(input.previous, id)
        : undefined,
      nextValue: id => getDocumentViewById(input.next, id)
    })
  }

  if (!records.ids && !records.values && !fields.ids && !fields.values && !views.ids && !views.values) {
    return undefined
  }

  return {
    ...(records.ids || records.values
      ? { records }
      : {}),
    ...(fields.ids || fields.values
      ? { fields }
      : {}),
    ...(views.ids || views.values
      ? { views }
      : {})
  }
}

const createEmptyActivePatch = (input: {
  previous?: ViewState
  document: DataDoc
}): ActivePatch => {
  const activeViewId = input.document.activeViewId
  const activeView = activeViewId
    ? getDocumentViewById(input.document, activeViewId)
    : undefined
  const previousFieldIds = input.previous?.fields.ids ?? EMPTY_FIELD_IDS
  const previousItemIds = input.previous?.items.ids ?? EMPTY_ITEM_IDS
  const previousSectionKeys = input.previous?.sections.ids ?? EMPTY_SECTION_KEYS

  return {
    view: {
      ready: false,
      id: activeViewId,
      type: activeView?.type,
      value: activeView
    },
    items: {
      ids: EMPTY_ITEM_IDS,
      values: createEntityPatch<ItemId, ViewItem>({
        previousIds: previousItemIds,
        nextIds: EMPTY_ITEM_IDS,
        previousValue: id => input.previous?.items.get(id),
        nextValue: () => undefined
      }),
      index: createEntityPatch<ItemId, number>({
        previousIds: previousItemIds,
        nextIds: EMPTY_ITEM_IDS,
        previousValue: id => input.previous?.items.indexOf(id),
        nextValue: () => undefined
      })
    },
    sections: {
      keys: EMPTY_SECTION_KEYS,
      values: createEntityPatch<SectionKey, Section>({
        previousIds: previousSectionKeys,
        nextIds: EMPTY_SECTION_KEYS,
        previousValue: key => input.previous?.sections.get(key),
        nextValue: () => undefined
      }),
      itemIds: createSectionItemIdsPatch({
        previous: input.previous,
        next: undefined
      }),
      summary: createSectionSummaryPatch({
        previous: input.previous,
        next: undefined
      })
    },
    fields: {
      all: {
        ids: EMPTY_FIELD_IDS,
        values: createEntityPatch<FieldId, Field>({
          previousIds: previousFieldIds,
          nextIds: EMPTY_FIELD_IDS,
          previousValue: id => input.previous?.fields.get(id),
          nextValue: () => undefined
        })
      },
      custom: {
        ids: EMPTY_FIELD_IDS,
        values: createEntityPatch<FieldId, CustomField>({
          previousIds: input.previous?.fields.custom.map(field => field.id) ?? EMPTY_FIELD_IDS,
          nextIds: EMPTY_FIELD_IDS,
          previousValue: id => input.previous?.fields.custom.find(field => field.id === id),
          nextValue: () => undefined
        })
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
      sortDir: createSortDirectionPatch({
        previous: input.previous,
        next: undefined
      })
    },
    table: {
      wrap: false,
      showVerticalLines: false,
      calc: createTableCalcPatch({
        previous: input.previous,
        next: undefined
      })
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

const createActivePatch = (input: {
  previous?: ViewState
  next?: ViewState
  document: DataDoc
}): ActivePatch | undefined => {
  const next = input.next
  const previous = input.previous
  const activeViewId = input.document.activeViewId
  const activeView = activeViewId
    ? getDocumentViewById(input.document, activeViewId)
    : undefined

  if (!next || !activeView) {
    return createEmptyActivePatch({
      previous,
      document: input.document
    })
  }

  const itemIds = next.items.ids
  const sectionKeys = next.sections.ids
  const fieldIds = next.fields.ids
  const customFieldIds = next.fields.custom.map(field => field.id)
  const filterFieldIds = next.query.filters.rules.flatMap(entry => {
    const fieldId = getFilterFieldId(entry.rule)
    return fieldId ? [fieldId] : []
  })
  const sortFieldIds = next.query.sort.rules.flatMap(entry => {
    const fieldId = getSorterFieldId(entry.sorter)
    return fieldId ? [fieldId] : []
  })
  const gallery = resolveGalleryState(next.view, next.query)
  const kanban = resolveKanbanState(next.view, next.query)
  const itemsIdsChanged = !sameOrder(previous?.items.ids ?? EMPTY_ITEM_IDS, itemIds)
  const sectionKeysChanged = !sameOrder(previous?.sections.ids ?? EMPTY_SECTION_KEYS, sectionKeys)
  const fieldIdsChanged = !sameOrder(previous?.fields.ids ?? EMPTY_FIELD_IDS, fieldIds)
  const customFieldIdsChanged = !sameOrder(previous?.fields.custom.map(field => field.id) ?? EMPTY_FIELD_IDS, customFieldIds)
  const filterFieldIdsChanged = !sameOrder(
    previous?.query.filters.rules.flatMap(entry => {
      const fieldId = getFilterFieldId(entry.rule)
      return fieldId ? [fieldId] : []
    }) ?? EMPTY_FIELD_IDS,
    filterFieldIds
  )
  const sortFieldIdsChanged = !sameOrder(
    previous?.query.sort.rules.flatMap(entry => {
      const fieldId = getSorterFieldId(entry.sorter)
      return fieldId ? [fieldId] : []
    }) ?? EMPTY_FIELD_IDS,
    sortFieldIds
  )

  const itemsPatch = createEntityPatch<ItemId, ViewItem>({
    previousIds: previous?.items.ids,
    nextIds: itemIds,
    previousValue: id => previous?.items.get(id),
    nextValue: id => next.items.get(id)
  })
  const itemIndexPatch = createItemIndexPatch({
    previous,
    next
  })
  const sectionsPatch = createEntityPatch<SectionKey, Section>({
    previousIds: previous?.sections.ids,
    nextIds: sectionKeys,
    previousValue: key => previous?.sections.get(key),
    nextValue: key => next.sections.get(key)
  })
  const sectionItemsPatch = createSectionItemIdsPatch({
    previous,
    next
  })
  const sectionSummaryPatch = createSectionSummaryPatch({
    previous,
    next
  })
  const allFieldsPatch = createEntityPatch<FieldId, Field>({
    previousIds: previous?.fields.ids,
    nextIds: fieldIds,
    previousValue: id => previous?.fields.get(id),
    nextValue: id => next.fields.get(id)
  })
  const customFieldsPatch = createEntityPatch<FieldId, CustomField>({
    previousIds: previous?.fields.custom.map(field => field.id),
    nextIds: customFieldIds,
    previousValue: id => previous?.fields.custom.find(field => field.id === id),
    nextValue: id => next.fields.custom.find(field => field.id === id)
  })
  const sortDirPatch = createSortDirectionPatch({
    previous,
    next
  })
  const tableCalcPatch = createTableCalcPatch({
    previous,
    next
  })

  const viewPatch = (
    previous?.view !== next.view
    || previous?.view.id !== next.view.id
    || previous?.view.type !== next.view.type
  )
    ? {
        ready: true,
        id: next.view.id,
        type: next.view.type,
        value: next.view
      }
    : undefined

  const queryPatch = (
    previous?.query.search !== next.query.search
    || previous?.query.filters !== next.query.filters
    || previous?.query.sort !== next.query.sort
    || previous?.query.group !== next.query.group
    || filterFieldIdsChanged
    || sortFieldIdsChanged
    || sortDirPatch
  )
    ? {
        ...(previous?.query.search !== next.query.search
          ? { search: next.query.search }
          : {}),
        ...(previous?.query.filters !== next.query.filters
          ? { filters: next.query.filters }
          : {}),
        ...(previous?.query.sort !== next.query.sort
          ? { sort: next.query.sort }
          : {}),
        ...(previous?.query.group !== next.query.group
          ? { group: next.query.group } : {}),
        grouped: next.query.group.active,
        groupFieldId: next.query.group.fieldId,
        filterFieldIds,
        sortFieldIds,
        ...(sortDirPatch
          ? { sortDir: sortDirPatch }
          : {})
      }
    : undefined

  const tablePatch = (
    previous?.view.type !== next.view.type
    || previous?.view.options.table.wrap !== next.view.options.table.wrap
    || previous?.view.options.table.showVerticalLines !== next.view.options.table.showVerticalLines
    || tableCalcPatch
  )
    ? {
        wrap: next.view.type === 'table'
          ? next.view.options.table.wrap
          : false,
        showVerticalLines: next.view.type === 'table'
          ? next.view.options.table.showVerticalLines
          : false,
        ...(tableCalcPatch
          ? { calc: tableCalcPatch }
          : {})
      }
    : undefined

  const galleryPatch = (
    previous?.view !== next.view
    || previous?.query.group !== next.query.group
    || previous?.query.sort !== next.query.sort
  )
    ? {
        wrap: gallery.card.wrap,
        size: gallery.card.size,
        layout: gallery.card.layout,
        canReorder: gallery.canReorder,
        groupUsesOptionColors: gallery.groupUsesOptionColors
      }
    : undefined

  const kanbanPatch = (
    previous?.view !== next.view
    || previous?.query.group !== next.query.group
    || previous?.query.sort !== next.query.sort
  )
    ? {
        wrap: kanban.card.wrap,
        size: kanban.card.size,
        layout: kanban.card.layout,
        canReorder: kanban.canReorder,
        groupUsesOptionColors: kanban.groupUsesOptionColors,
        fillColumnColor: kanban.fillColumnColor,
        cardsPerColumn: kanban.cardsPerColumn
      }
    : undefined

  const patch: ActivePatch = {
    ...(viewPatch ? { view: viewPatch } : {}),
    ...(
      itemsIdsChanged || itemsPatch || itemIndexPatch
        ? {
            items: {
              ...(itemsIdsChanged ? { ids: itemIds } : {}),
              ...(itemsPatch ? { values: itemsPatch } : {}),
              ...(itemIndexPatch ? { index: itemIndexPatch } : {})
            }
          }
        : {}
    ),
    ...(
      sectionKeysChanged || sectionsPatch || sectionItemsPatch || sectionSummaryPatch
        ? {
            sections: {
              ...(sectionKeysChanged ? { keys: sectionKeys } : {}),
              ...(sectionsPatch ? { values: sectionsPatch } : {}),
              ...(sectionItemsPatch ? { itemIds: sectionItemsPatch } : {}),
              ...(sectionSummaryPatch ? { summary: sectionSummaryPatch } : {})
            }
          }
        : {}
    ),
    ...(
      fieldIdsChanged || allFieldsPatch || customFieldIdsChanged || customFieldsPatch
        ? {
            fields: {
              all: {
                ...(fieldIdsChanged ? { ids: fieldIds } : {}),
                ...(allFieldsPatch ? { values: allFieldsPatch } : {})
              },
              custom: {
                ...(customFieldIdsChanged ? { ids: customFieldIds } : {}),
                ...(customFieldsPatch ? { values: customFieldsPatch } : {})
              }
            }
          }
        : {}
    ),
    ...(queryPatch ? { query: queryPatch } : {}),
    ...(tablePatch ? { table: tablePatch } : {}),
    ...(galleryPatch ? { gallery: galleryPatch } : {}),
    ...(kanbanPatch ? { kanban: kanbanPatch } : {})
  }

  return Object.keys(patch).length
    ? patch
    : undefined
}

export const projectEnginePatch = (input: {
  previousDoc?: DataDoc
  previousSnapshot?: ViewState
  nextDoc: DataDoc
  nextSnapshot?: ViewState
}): EnginePatch => {
  const doc = createDocumentPatch({
    previous: input.previousDoc,
    next: input.nextDoc
  })
  const active = createActivePatch({
    previous: input.previousSnapshot,
    next: input.nextSnapshot,
    document: input.nextDoc
  })

  return {
    ...(doc
      ? { doc }
      : {}),
    ...(active
      ? { active }
      : {})
  }
}
