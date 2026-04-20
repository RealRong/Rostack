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
  CommitImpact,
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
import { sameOrder } from '@shared/core'
import type {
  ViewRuntimeDelta,
} from '@dataview/engine/contracts/internal'
import type {
  DocumentChange,
  EntityDelta,
  ItemId,
  Section,
  SectionKey,
  SourceDelta,
  TableLayoutSectionState,
  TableLayoutState,
  ViewItem,
  ViewPublishDelta,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection,
  ViewState
} from '@dataview/engine/contracts/public'
import { EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP } from '@dataview/engine/contracts/public'

const EMPTY_RECORD_IDS = [] as readonly string[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_VIEW_IDS = [] as readonly ViewId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_FILTERS = { rules: [] } satisfies ViewFilterProjection
const EMPTY_SORT = { rules: [] } satisfies ViewSortProjection
const EMPTY_SEARCH = { query: '' } satisfies ViewSearchProjection
const DEFAULT_CARD_LAYOUT = 'vertical' as CardLayout
const DEFAULT_CARD_SIZE = 'medium' as CardSize
const DEFAULT_KANBAN_CARDS_PER_COLUMN = 0 as KanbanCardsPerColumn
const EMPTY_LAYOUT_SECTIONS = [] as readonly TableLayoutSectionState[]

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
) => {
  if (!view || view.type !== 'gallery' || !query) {
    return {
      wrap: false,
      size: DEFAULT_CARD_SIZE,
      layout: DEFAULT_CARD_LAYOUT,
      canReorder: false,
      groupUsesOptionColors: false
    }
  }

  return {
    wrap: view.options.gallery.card.wrap,
    size: view.options.gallery.card.size,
    layout: view.options.gallery.card.layout,
    canReorder: !query.group.active && query.sort.rules.length === 0,
    groupUsesOptionColors: usesOptionGroupingColors(query.group.field)
  }
}

const resolveKanbanState = (
  view: View | undefined,
  query: {
    group: ViewGroupProjection
    sort: ViewSortProjection
  } | undefined
) => {
  if (!view || view.type !== 'kanban' || !query) {
    return {
      wrap: false,
      size: DEFAULT_CARD_SIZE,
      layout: DEFAULT_CARD_LAYOUT,
      canReorder: false,
      groupUsesOptionColors: false,
      fillColumnColor: false,
      cardsPerColumn: DEFAULT_KANBAN_CARDS_PER_COLUMN
    }
  }

  const groupUsesOptionColors = usesOptionGroupingColors(query.group.field)

  return {
    wrap: view.options.kanban.card.wrap,
    size: view.options.kanban.card.size,
    layout: view.options.kanban.card.layout,
    canReorder: query.group.active && query.sort.rules.length === 0,
    groupUsesOptionColors,
    fillColumnColor: groupUsesOptionColors && view.options.kanban.fillColumnColor,
    cardsPerColumn: view.options.kanban.cardsPerColumn
  }
}

const pushIds = <T,>(
  target: Set<T>,
  values?: Iterable<T>
) => {
  if (!values) {
    return
  }

  for (const value of values) {
    target.add(value)
  }
}

const setMap = <TKey, TValue>(
  values: readonly (readonly [TKey, TValue | undefined])[]
): ReadonlyMap<TKey, TValue | undefined> | undefined => values.length
  ? new Map(values)
  : undefined

const entityDelta = <TKey, TValue>(input: {
  set?: readonly (readonly [TKey, TValue | undefined])[]
  remove?: readonly TKey[]
}): EntityDelta<TKey, TValue> | undefined => (
  input.set?.length || input.remove?.length
    ? {
        ...(input.set?.length
          ? {
              set: new Map(input.set)
            }
          : {}),
        ...(input.remove?.length
          ? {
              remove: input.remove
            }
          : {})
      }
    : undefined
)

const buildDocumentEntityDelta = <TKey, TValue>(input: {
  ids: readonly TKey[]
  changed: readonly TKey[]
  removed: readonly TKey[]
  value: (key: TKey) => TValue | undefined
}): {
  ids?: readonly TKey[]
  values?: EntityDelta<TKey, TValue>
} | undefined => {
  const set = input.changed.flatMap(key => (
    [[key, input.value(key)] as const]
  ))
  const values = entityDelta<TKey, TValue>({
    set,
    remove: input.removed
  })

  return input.changed.length || input.removed.length
    ? {
        ids: input.ids,
        ...(values
          ? { values }
          : {})
      }
    : values
      ? {
          values
        }
      : undefined
}

const buildFilterFieldIds = (
  query: ViewState['query']
): readonly FieldId[] => query.filters.rules.flatMap(entry => {
  const fieldId = getFilterFieldId(entry.rule)
  return fieldId ? [fieldId] : []
})

const buildSortFieldIds = (
  query: ViewState['query']
): readonly FieldId[] => query.sort.rules.flatMap(entry => {
  const fieldId = getSorterFieldId(entry.sorter)
  return fieldId ? [fieldId] : []
})

const buildSortDir = (
  query: ViewState['query']
): ReadonlyMap<FieldId, SortDirection | undefined> => new Map(
  query.sort.rules.flatMap(entry => {
    const fieldId = getSorterFieldId(entry.sorter)
    return fieldId
      ? [[fieldId, entry.sorter.direction] as const]
      : []
  })
)

const collectRemovedKeys = <TKey,>(
  previousIds: readonly TKey[],
  nextIds: readonly TKey[]
) => {
  if (!previousIds.length) {
    return [] as TKey[]
  }

  const nextIdSet = new Set(nextIds)
  return previousIds.filter(key => !nextIdSet.has(key))
}

const buildItemValueDelta = (input: {
  previous?: ViewState
  next: ViewState
  changedSections: readonly SectionKey[]
  removedSections: readonly SectionKey[]
  rebuild: boolean
}) => {
  if (input.rebuild || !input.previous) {
    return entityDelta<ItemId, ViewItem>({
      set: input.next.items.ids.map(itemId => [itemId, input.next.items.get(itemId)] as const)
    })
  }

  const set = new Map<ItemId, ViewItem | undefined>()
  const remove = new Set<ItemId>()

  input.removedSections.forEach(sectionKey => {
    input.previous?.sections.get(sectionKey)?.items.ids.forEach(itemId => {
      remove.add(itemId)
    })
  })

  input.changedSections.forEach(sectionKey => {
    const previousItemIds = input.previous?.sections.get(sectionKey)?.items.ids ?? EMPTY_ITEM_IDS
    const nextItemIds = input.next.sections.get(sectionKey)?.items.ids ?? EMPTY_ITEM_IDS
    const nextItemIdSet = new Set(nextItemIds)

    previousItemIds.forEach(itemId => {
      if (!nextItemIdSet.has(itemId)) {
        remove.add(itemId)
      }
    })

    nextItemIds.forEach(itemId => {
      const nextItem = input.next.items.get(itemId)
      if (!nextItem) {
        return
      }

      if (input.previous?.items.get(itemId) === nextItem) {
        return
      }

      set.set(itemId, nextItem)
    })
  })

  return entityDelta<ItemId, ViewItem>({
    set: [...set.entries()],
    remove: [...remove]
  })
}

const buildSectionValueDelta = (input: {
  previous?: ViewState
  next: ViewState
  changedSections: readonly SectionKey[]
  removedSections: readonly SectionKey[]
  rebuild: boolean
}) => {
  if (input.rebuild || !input.previous) {
    return entityDelta<SectionKey, Section>({
      set: input.next.sections.ids.map(sectionKey => [sectionKey, input.next.sections.get(sectionKey)] as const)
    })
  }

  return entityDelta<SectionKey, Section>({
    set: input.changedSections
      .map(sectionKey => [sectionKey, input.next.sections.get(sectionKey)] as const)
      .filter(([, value]) => value !== undefined),
    remove: input.removedSections
  })
}

const buildSectionSummaryDelta = (input: {
  previous?: ViewState
  next: ViewState
  changedSections: readonly SectionKey[]
  removedSections: readonly SectionKey[]
  rebuild: boolean
}) => {
  if (input.rebuild || !input.previous) {
    return entityDelta<SectionKey, CalculationCollection | undefined>({
      set: input.next.sections.ids.map(sectionKey => [sectionKey, input.next.summaries.get(sectionKey)] as const)
    })
  }

  return entityDelta<SectionKey, CalculationCollection | undefined>({
    set: input.changedSections.map(sectionKey => [sectionKey, input.next.summaries.get(sectionKey)] as const),
    remove: input.removedSections
  })
}

const buildFieldCollectionDelta = <TField extends Field | CustomField>(input: {
  previous?: readonly TField[]
  next: readonly TField[]
}): EntityDelta<FieldId, TField> | undefined => entityDelta({
  set: input.next.map(field => [field.id, field] as const),
  remove: input.previous
    ? collectRemovedKeys(
        input.previous.map(field => field.id),
        input.next.map(field => field.id)
      )
    : []
})

const buildMapValueDelta = <TKey, TValue>(input: {
  previous?: ReadonlyMap<TKey, TValue | undefined>
  next: ReadonlyMap<TKey, TValue | undefined>
}): EntityDelta<TKey, TValue> | undefined => entityDelta({
  set: [...input.next.entries()],
  remove: input.previous
    ? [...input.previous.keys()].filter(key => !input.next.has(key))
    : []
})

const createTableLayoutSection = (input: {
  key: SectionKey
  collapsed: boolean
  itemIds: readonly ItemId[]
}): TableLayoutSectionState => ({
  key: input.key,
  collapsed: input.collapsed,
  itemIds: input.itemIds
})

const syncTableLayoutState = (input: {
  previous: TableLayoutState | null
  view?: ViewState
}): TableLayoutState | null => {
  const view = input.view
  if (!view || view.view.type !== 'table') {
    return null
  }

  const grouped = view.query.group.active
  const rowCount = view.items.ids.length
  const previousSectionsByKey = new Map(
    input.previous?.sections.map(section => [section.key, section] as const) ?? []
  )
  const nextSections = grouped
    ? view.sections.ids.flatMap(sectionKey => {
        const section = view.sections.get(sectionKey)
        if (!section) {
          return []
        }

        const previousSection = previousSectionsByKey.get(sectionKey)
        if (
          previousSection
          && previousSection.collapsed === section.collapsed
          && previousSection.itemIds === section.items.ids
        ) {
          return [previousSection]
        }

        return [createTableLayoutSection({
          key: sectionKey,
          collapsed: section.collapsed,
          itemIds: section.items.ids
        })]
      })
    : [
        (() => {
          const rootKey = view.sections.ids[0] ?? ('root' as SectionKey)
          const previousSection = input.previous?.sections[0]
          if (
            previousSection
            && previousSection.key === rootKey
            && !previousSection.collapsed
            && previousSection.itemIds === view.items.ids
          ) {
            return previousSection
          }

          return createTableLayoutSection({
            key: rootKey,
            collapsed: false,
            itemIds: view.items.ids
          })
        })()
      ]

  if (
    input.previous
    && input.previous.grouped === grouped
    && input.previous.rowCount === rowCount
    && input.previous.sections.length === nextSections.length
    && input.previous.sections.every((section, index) => section === nextSections[index])
  ) {
    return input.previous
  }

  return {
    grouped,
    rowCount,
    sections: nextSections.length
      ? nextSections
      : EMPTY_LAYOUT_SECTIONS
  }
}

const buildTableCalcValues = (
  view?: ViewState
): ReadonlyMap<FieldId, CalculationMetric | undefined> => view?.view.type === 'table'
  ? new Map(
      view.fields.ids.map(fieldId => [
        fieldId,
        view.view.calc[fieldId] ?? undefined
      ] as const)
    )
  : new Map()

export const projectDocumentChange = (input: {
  impact: CommitImpact
  document: DataDoc
}): DocumentChange => {
  if (input.impact.reset) {
    return {
      records: {
        changed: getDocumentRecordIds(input.document),
        removed: []
      },
      fields: {
        changed: getDocumentCustomFieldIds(input.document),
        removed: []
      },
      views: {
        changed: getDocumentViewIds(input.document),
        removed: []
      },
      activeViewChanged: true
    }
  }

  const recordIds = new Set<string>()
  pushIds(recordIds, input.impact.records?.inserted)
  pushIds(recordIds, input.impact.records?.patched?.keys())
  pushIds(recordIds, input.impact.records?.titleChanged)

  const fieldIds = new Set<FieldId>()
  pushIds(fieldIds, input.impact.fields?.inserted)
  pushIds(fieldIds, input.impact.fields?.schema?.keys())

  const viewIds = new Set<ViewId>()
  pushIds(viewIds, input.impact.views?.inserted)
  pushIds(viewIds, input.impact.views?.changed?.keys())

  return {
    records: {
      changed: [...recordIds],
      removed: [...(input.impact.records?.removed ?? [])]
    },
    fields: {
      changed: [...fieldIds],
      removed: [...(input.impact.fields?.removed ?? [])]
    },
    views: {
      changed: [...viewIds],
      removed: [...(input.impact.views?.removed ?? [])]
    },
    activeViewChanged: Boolean(input.impact.activeView)
  }
}

export const projectViewPublishDelta = (input: {
  previous?: ViewState
  next?: ViewState
  delta?: ViewRuntimeDelta
}): ViewPublishDelta | undefined => {
  const next = input.next
  const previous = input.previous

  if (!next) {
    return previous
      ? {
          rebuild: true,
          view: {
            ready: false,
            id: undefined,
            type: undefined,
            value: undefined
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
            sortDir: new Map()
          },
          items: {
            ids: EMPTY_ITEM_IDS,
            values: entityDelta({
              remove: previous.items.ids
            })
          },
          sections: {
            keys: EMPTY_SECTION_KEYS,
            values: entityDelta({
              remove: previous.sections.ids
            }),
            summary: entityDelta({
              remove: previous.sections.ids
            })
          },
          fields: {
            all: [],
            custom: []
          },
          table: {
            wrap: false,
            showVerticalLines: false,
            calc: new Map()
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
      : undefined
  }

  const rebuild = (
    !previous
    || previous.view.id !== next.view.id
    || previous.view.type !== next.view.type
  )
  const filterFieldIds = buildFilterFieldIds(next.query)
  const sortFieldIds = buildSortFieldIds(next.query)
  const sortDir = buildSortDir(next.query)
  const previousFilterFieldIds = previous
    ? buildFilterFieldIds(previous.query)
    : EMPTY_FIELD_IDS
  const previousSortFieldIds = previous
    ? buildSortFieldIds(previous.query)
    : EMPTY_FIELD_IDS
  const previousSortDir = previous
    ? buildSortDir(previous.query)
    : new Map<FieldId, SortDirection | undefined>()
  const sectionRebuild = Boolean(input.delta?.sections.rebuild)
  const summaryRebuild = Boolean(input.delta?.summary.rebuild)
  const changedSections = input.delta
    ? (
        sectionRebuild
          ? next.sections.ids
          : input.delta.sections.changed
      )
    : previous
      ? collectRemovedKeys(previous.sections.ids, next.sections.ids).length
          || !sameOrder(previous.sections.ids, next.sections.ids)
          ? next.sections.ids
          : next.sections.ids.filter(sectionKey => previous.sections.get(sectionKey) !== next.sections.get(sectionKey))
      : next.sections.ids
  const removedSections = input.delta
    ? input.delta.sections.removed
    : previous
      ? collectRemovedKeys(previous.sections.ids, next.sections.ids)
      : []
  const changedSummarySections = input.delta
    ? (
        summaryRebuild
          ? next.sections.ids
          : input.delta.summary.changed
      )
    : changedSections
  const removedSummarySections = input.delta
    ? input.delta.summary.removed
    : removedSections
  const itemValues = buildItemValueDelta({
    previous,
    next,
    changedSections,
    removedSections,
    rebuild: rebuild || sectionRebuild
  })
  const sectionValues = buildSectionValueDelta({
    previous,
    next,
    changedSections,
    removedSections,
    rebuild: rebuild || sectionRebuild
  })
  const summaryValues = buildSectionSummaryDelta({
    previous,
    next,
    changedSections: changedSummarySections,
    removedSections: removedSummarySections,
    rebuild: rebuild || summaryRebuild
  })
  const gallery = resolveGalleryState(next.view, next.query)
  const kanban = resolveKanbanState(next.view, next.query)
  const queryChanged = (
    rebuild
    || previous?.query.search !== next.query.search
    || previous?.query.filters !== next.query.filters
    || previous?.query.sort !== next.query.sort
    || previous?.query.group !== next.query.group
    || !sameOrder(previousFilterFieldIds, filterFieldIds)
    || !sameOrder(previousSortFieldIds, sortFieldIds)
    || previousSortDir.size !== sortDir.size
    || [...sortDir.entries()].some(([fieldId, value]) => previousSortDir.get(fieldId) !== value)
  )
  const tableChanged = (
    rebuild
    || previous?.view.type !== next.view.type
    || previous?.view.options.table.wrap !== next.view.options.table.wrap
    || previous?.view.options.table.showVerticalLines !== next.view.options.table.showVerticalLines
    || previous?.view.calc !== next.view.calc
  )
  const fieldsChanged = rebuild || previous?.fields !== next.fields

  const delta: ViewPublishDelta = {
    rebuild
  }

  if (
    rebuild
    || previous?.view !== next.view
    || previous?.view.id !== next.view.id
    || previous?.view.type !== next.view.type
  ) {
    delta.view = {
      ready: true,
      id: next.view.id,
      type: next.view.type,
      value: next.view
    }
  }

  if (queryChanged) {
    delta.query = {
      search: next.query.search,
      filters: next.query.filters,
      sort: next.query.sort,
      group: next.query.group,
      grouped: next.query.group.active,
      groupFieldId: next.query.group.fieldId,
      filterFieldIds,
      sortFieldIds,
      sortDir
    }
  }

  if (rebuild || previous?.items.ids !== next.items.ids || itemValues) {
    delta.items = {
      ...(rebuild || previous?.items.ids !== next.items.ids
        ? {
            ids: next.items.ids
          }
        : {}),
      ...(itemValues
        ? {
            values: itemValues
          }
        : {})
    }
  }

  if (
    rebuild
    || previous?.sections.ids !== next.sections.ids
    || sectionValues
    || summaryValues
  ) {
    delta.sections = {
      ...(rebuild || previous?.sections.ids !== next.sections.ids
        ? {
            keys: next.sections.ids
          }
        : {}),
      ...(sectionValues
        ? {
            values: sectionValues
          }
        : {}),
      ...(summaryValues
        ? {
            summary: summaryValues
          }
        : {})
    }
  }

  if (fieldsChanged) {
    delta.fields = {
      all: next.fields.all,
      custom: next.fields.custom
    }
  }

  if (tableChanged) {
    delta.table = {
      wrap: next.view.type === 'table'
        ? next.view.options.table.wrap
        : false,
      showVerticalLines: next.view.type === 'table'
        ? next.view.options.table.showVerticalLines
        : false,
      calc: new Map(
        next.fields.ids.map(fieldId => [
          fieldId,
          next.view.type === 'table'
            ? next.view.calc[fieldId] ?? undefined
            : undefined
        ] as const)
      )
    }
  }

  if (rebuild || previous?.view !== next.view || previous?.query !== next.query) {
    delta.gallery = gallery
    delta.kanban = kanban
  }

  return Object.keys(delta).length > 1
    ? delta
    : undefined
}

export const projectEngineOutput = (input: {
  document: DataDoc
  documentChange: DocumentChange
  previousView?: ViewState
  nextView?: ViewState
  viewDelta?: ViewRuntimeDelta
  previousLayout: TableLayoutState | null
}): {
  sourceDelta: SourceDelta
  tableLayout: TableLayoutState | null
} => {
  const publishDelta = projectViewPublishDelta({
    previous: input.previousView,
    next: input.nextView,
    delta: input.viewDelta
  })
  const tableLayout = syncTableLayoutState({
    previous: input.previousLayout,
    view: input.nextView
  })
  const previousSortDir = input.previousView
    ? buildSortDir(input.previousView.query)
    : undefined
  const nextSortDir = input.nextView
    ? buildSortDir(input.nextView.query)
    : new Map<FieldId, SortDirection | undefined>()
  const previousTableCalc = buildTableCalcValues(input.previousView)
  const nextTableCalc = buildTableCalcValues(input.nextView)
  const document = {
    records: buildDocumentEntityDelta<RecordId, DataRecord>({
      ids: getDocumentRecordIds(input.document),
      changed: input.documentChange.records.changed as readonly RecordId[],
      removed: input.documentChange.records.removed as readonly RecordId[],
      value: recordId => getDocumentRecordById(input.document, recordId)
    }),
    fields: buildDocumentEntityDelta<FieldId, CustomField>({
      ids: getDocumentCustomFieldIds(input.document),
      changed: input.documentChange.fields.changed,
      removed: input.documentChange.fields.removed,
      value: fieldId => getDocumentCustomFieldById(input.document, fieldId)
    }),
    views: buildDocumentEntityDelta<ViewId, View>({
      ids: getDocumentViewIds(input.document),
      changed: input.documentChange.views.changed,
      removed: input.documentChange.views.removed,
      value: viewId => getDocumentViewById(input.document, viewId)
    })
  }
  const active = publishDelta
    ? {
        ...(publishDelta.view
          ? {
              view: publishDelta.view
            }
          : {}),
        ...(publishDelta.items
          ? {
              items: {
                ...(publishDelta.items.ids
                  ? {
                      ids: publishDelta.items.ids
                    }
                  : {}),
                ...(publishDelta.items.values
                  ? {
                      values: publishDelta.items.values
                    }
                  : {})
              }
            }
          : {}),
        ...(publishDelta.sections
          ? {
              sections: {
                ...(publishDelta.sections.keys
                  ? {
                      keys: publishDelta.sections.keys
                    }
                  : {}),
                ...(publishDelta.sections.values
                  ? {
                      values: publishDelta.sections.values
                    }
                  : {}),
                ...(publishDelta.sections.summary
                  ? {
                      summary: publishDelta.sections.summary
                    }
                  : {})
              }
            }
          : {}),
        ...(publishDelta.fields
          ? {
              fields: {
                ...(publishDelta.fields.all
                  ? {
                      all: {
                        ids: publishDelta.fields.all.map(field => field.id),
                        values: buildFieldCollectionDelta({
                          previous: input.previousView?.fields.all,
                          next: publishDelta.fields.all
                        })
                      }
                    }
                  : {}),
                ...(publishDelta.fields.custom
                  ? {
                      custom: {
                        ids: publishDelta.fields.custom.map(field => field.id),
                        values: buildFieldCollectionDelta({
                          previous: input.previousView?.fields.custom,
                          next: publishDelta.fields.custom
                        })
                      }
                    }
                  : {})
              }
            }
          : {}),
        ...(publishDelta.query
          ? {
              query: {
                ...(publishDelta.query.search
                  ? {
                      search: publishDelta.query.search
                    }
                  : {}),
                ...(publishDelta.query.filters
                  ? {
                      filters: publishDelta.query.filters
                    }
                  : {}),
                ...(publishDelta.query.sort
                  ? {
                      sort: publishDelta.query.sort
                    }
                  : {}),
                ...(publishDelta.query.group
                  ? {
                      group: publishDelta.query.group
                    }
                  : {}),
                ...(publishDelta.query.grouped !== undefined
                  ? {
                      grouped: publishDelta.query.grouped
                    }
                  : {}),
                ...(publishDelta.query.groupFieldId !== undefined
                  ? {
                      groupFieldId: publishDelta.query.groupFieldId
                    }
                  : {}),
                ...(publishDelta.query.filterFieldIds
                  ? {
                      filterFieldIds: publishDelta.query.filterFieldIds
                    }
                  : {}),
                ...(publishDelta.query.sortFieldIds
                  ? {
                      sortFieldIds: publishDelta.query.sortFieldIds
                    }
                  : {}),
                ...(publishDelta.query.sortDir
                  ? {
                      sortDir: buildMapValueDelta<FieldId, SortDirection>({
                        previous: previousSortDir,
                        next: nextSortDir
                      })
                    }
                  : {})
              }
            }
          : {}),
        ...(
          publishDelta.table || input.previousLayout !== tableLayout
            ? {
                table: {
                  ...(publishDelta.table?.wrap !== undefined
                    ? {
                        wrap: publishDelta.table.wrap
                      }
                    : {}),
                  ...(publishDelta.table?.showVerticalLines !== undefined
                    ? {
                        showVerticalLines: publishDelta.table.showVerticalLines
                      }
                    : {}),
                  ...(publishDelta.table?.calc
                    ? {
                        calc: buildMapValueDelta<FieldId, CalculationMetric>({
                          previous: previousTableCalc,
                          next: nextTableCalc
                        })
                      }
                    : {}),
                  ...(input.previousLayout !== tableLayout
                    ? {
                        layout: tableLayout
                      }
                    : {})
                }
              }
            : {}
        ),
        ...(publishDelta.gallery
          ? {
              gallery: publishDelta.gallery
            }
          : {}),
        ...(publishDelta.kanban
          ? {
              kanban: publishDelta.kanban
            }
          : {})
      }
    : (
      input.previousLayout !== tableLayout
        ? {
            table: {
              layout: tableLayout
            }
          }
        : undefined
    )

  return {
    sourceDelta: {
      ...(document.records || document.fields || document.views
        ? {
            document: {
              ...(document.records
                ? {
                    records: document.records
                  }
                : {}),
              ...(document.fields
                ? {
                    fields: document.fields
                  }
                : {}),
              ...(document.views
                ? {
                    views: document.views
                  }
                : {})
            }
          }
        : {}),
      ...(active
        ? { active }
        : {})
    },
    tableLayout
  }
}
