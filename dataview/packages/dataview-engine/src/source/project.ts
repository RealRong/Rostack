import type { CalculationCollection } from '@dataview/core/calculation'
import {
  impact as commitImpact
} from '@dataview/core/commit/impact'
import {
  document as documentApi
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
  KanbanCardsPerColumn,
  RecordId,
  SortDirection,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import {
  EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP
} from '@dataview/engine/contracts'
import type {
  EntityDelta,
  FilterRuleProjection,
  ItemId,
  Section,
  SectionKey,
  SourceDelta,
  TableLayoutSectionState,
  TableLayoutState,
  ViewFilterProjection,
  ViewItem,
  ViewSearchProjection,
  ViewSortProjection,
  ViewState
} from '@dataview/engine/contracts'
import type {
  SnapshotChange
} from '@dataview/engine/contracts/state'

const EMPTY_FIELDS = [] as readonly Field[]
const EMPTY_CUSTOM_FIELDS = [] as readonly CustomField[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_FILTERS = { rules: [] as readonly FilterRuleProjection[] } satisfies ViewFilterProjection
const EMPTY_SORT = { rules: [] } satisfies ViewSortProjection
const EMPTY_SORT_DIR = new Map<FieldId, SortDirection | undefined>()
const EMPTY_SEARCH = { query: '' } satisfies ViewSearchProjection
const EMPTY_TABLE_CALC = new Map<FieldId, CalculationMetric | undefined>()
const DEFAULT_CARD_LAYOUT = 'vertical' as CardLayout
const DEFAULT_CARD_SIZE = 'medium' as CardSize
const DEFAULT_KANBAN_CARDS_PER_COLUMN = 0 as KanbanCardsPerColumn
const EMPTY_LAYOUT_SECTIONS = [] as readonly TableLayoutSectionState[]

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

const buildDocumentEntityDelta = <TKey, TValue>(input: {
  ids: readonly TKey[]
  idsChanged: boolean
  changed: readonly TKey[]
  removed: readonly TKey[]
  value: (key: TKey) => TValue | undefined
}): {
  ids?: readonly TKey[]
  values?: EntityDelta<TKey, TValue>
} | undefined => {
  const values = entityDelta<TKey, TValue>({
    set: input.changed.map(key => [key, input.value(key)] as const),
    remove: input.removed
  })

  if (!input.idsChanged && !values) {
    return undefined
  }

  return {
    ...(input.idsChanged
      ? {
          ids: input.ids
        }
      : {}),
    ...(values
      ? {
          values
        }
      : {})
  }
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
    const previousItemIdSet = new Set(previousItemIds)
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

      if (
        previousItemIdSet.has(itemId)
        && input.previous?.items.get(itemId) === nextItem
      ) {
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

const readTouchedIds = <T,>(
  touched: ReadonlySet<T> | 'all',
  all: readonly T[]
): readonly T[] => touched === 'all'
  ? all
  : [...touched]

const projectDocumentDelta = (input: {
  impact: CommitImpact
  document: DataDoc
}): SourceDelta['document'] => {
  if (input.impact.reset) {
    return {
      records: buildDocumentEntityDelta<RecordId, DataRecord>({
        ids: documentApi.records.ids(input.document),
        idsChanged: true,
        changed: documentApi.records.ids(input.document),
        removed: [],
        value: recordId => documentApi.records.get(input.document, recordId)
      }),
      fields: buildDocumentEntityDelta<FieldId, CustomField>({
        ids: documentApi.fields.custom.ids(input.document),
        idsChanged: true,
        changed: documentApi.fields.custom.ids(input.document),
        removed: [],
        value: fieldId => documentApi.fields.custom.get(input.document, fieldId)
      }),
      views: buildDocumentEntityDelta<ViewId, View>({
        ids: documentApi.views.ids(input.document),
        idsChanged: true,
        changed: documentApi.views.ids(input.document),
        removed: [],
        value: viewId => documentApi.views.get(input.document, viewId)
      })
    }
  }

  const recordIds = readTouchedIds(
    commitImpact.record.touchedIds(input.impact),
    documentApi.records.ids(input.document)
  )
  const fieldIds = readTouchedIds(
    commitImpact.field.schemaIds(input.impact),
    documentApi.fields.custom.ids(input.document)
  )
  const viewIds = readTouchedIds(
    commitImpact.view.touchedIds(input.impact),
    documentApi.views.ids(input.document)
  )

  const records = buildDocumentEntityDelta<RecordId, DataRecord>({
    ids: documentApi.records.ids(input.document),
    idsChanged: Boolean(
      input.impact.records?.inserted?.size
      || input.impact.records?.removed?.size
    ),
    changed: recordIds as readonly RecordId[],
    removed: [...(input.impact.records?.removed ?? [])],
    value: recordId => documentApi.records.get(input.document, recordId)
  })
  const fields = buildDocumentEntityDelta<FieldId, CustomField>({
    ids: documentApi.fields.custom.ids(input.document),
    idsChanged: Boolean(
      input.impact.fields?.inserted?.size
      || input.impact.fields?.removed?.size
    ),
    changed: fieldIds as readonly FieldId[],
    removed: [...(input.impact.fields?.removed ?? [])],
    value: fieldId => documentApi.fields.custom.get(input.document, fieldId)
  })
  const views = buildDocumentEntityDelta<ViewId, View>({
    ids: documentApi.views.ids(input.document),
    idsChanged: Boolean(
      input.impact.views?.inserted?.size
      || input.impact.views?.removed?.size
    ),
    changed: viewIds as readonly ViewId[],
    removed: [...(input.impact.views?.removed ?? [])],
    value: viewId => documentApi.views.get(input.document, viewId)
  })

  return records || fields || views
    ? {
        ...(records
          ? {
              records
            }
          : {}),
        ...(fields
          ? {
              fields
            }
          : {}),
        ...(views
          ? {
              views
            }
          : {})
      }
    : undefined
}

const projectInactiveActiveDelta = (input: {
  previous?: ViewState
  previousLayout: TableLayoutState | null
}): SourceDelta['active'] => {
  if (!input.previous && input.previousLayout === null) {
    return undefined
  }

  const previous = input.previous
  const querySortDir = previous
    ? buildMapValueDelta<FieldId, SortDirection>({
        previous: previous.query.sortDir,
        next: EMPTY_SORT_DIR
      })
    : undefined
  const tableCalc = previous
    ? buildMapValueDelta<FieldId, CalculationMetric>({
        previous: previous.table.calc,
        next: EMPTY_TABLE_CALC
      })
    : undefined

  return {
    view: {
      ready: false,
      id: undefined,
      type: undefined,
      value: undefined
    },
    ...(previous
      ? {
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
            all: {
              ids: EMPTY_FIELD_IDS,
              values: buildFieldCollectionDelta({
                previous: previous.fields.all,
                next: EMPTY_FIELDS
              })
            },
            custom: {
              ids: EMPTY_FIELD_IDS,
              values: buildFieldCollectionDelta({
                previous: previous.fields.custom,
                next: EMPTY_CUSTOM_FIELDS
              })
            }
          }
        }
      : {}),
    query: {
      search: EMPTY_SEARCH,
      filters: EMPTY_FILTERS,
      sort: EMPTY_SORT,
      group: EMPTY_GROUP,
      grouped: false,
      groupFieldId: '',
      filterFieldIds: EMPTY_FIELD_IDS,
      sortFieldIds: EMPTY_FIELD_IDS,
      ...(querySortDir
        ? {
            sortDir: querySortDir
          }
        : {})
    },
    table: {
      wrap: false,
      showVerticalLines: false,
      ...(tableCalc
        ? {
            calc: tableCalc
          }
        : {}),
      layout: null
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

const projectActiveDelta = (input: {
  previous?: ViewState
  next?: ViewState
  snapshotChange?: SnapshotChange
  previousLayout: TableLayoutState | null
}): {
  active?: SourceDelta['active']
  tableLayout: TableLayoutState | null
} => {
  if (!input.next) {
    return {
      active: projectInactiveActiveDelta({
        previous: input.previous,
        previousLayout: input.previousLayout
      }),
      tableLayout: null
    }
  }

  const next = input.next
  const previous = input.previous
  const tableLayout = syncTableLayoutState({
    previous: input.previousLayout,
    view: next
  })
  const rebuild = (
    !previous
    || previous.view.id !== next.view.id
    || previous.view.type !== next.view.type
  )
  const sectionChange = input.snapshotChange?.sections
  const summaryChange = input.snapshotChange?.summary
  const changedSections = sectionChange
    ? (
        sectionChange.rebuild
          ? next.sections.ids
          : sectionChange.changed
      )
    : previous
      ? collectRemovedKeys(previous.sections.ids, next.sections.ids).length
          || !equal.sameOrder(previous.sections.ids, next.sections.ids)
          ? next.sections.ids
          : next.sections.ids.filter(sectionKey => previous.sections.get(sectionKey) !== next.sections.get(sectionKey))
      : next.sections.ids
  const removedSections = sectionChange
    ? sectionChange.removed
    : previous
      ? collectRemovedKeys(previous.sections.ids, next.sections.ids)
      : []
  const changedSummarySections = summaryChange
    ? (
        summaryChange.rebuild
          ? next.sections.ids
          : summaryChange.changed
      )
    : changedSections
  const removedSummarySections = summaryChange
    ? summaryChange.removed
    : removedSections
  const itemValues = buildItemValueDelta({
    previous,
    next,
    changedSections,
    removedSections,
    rebuild: rebuild || Boolean(sectionChange?.rebuild)
  })
  const items = (
    rebuild
    || previous?.items.ids !== next.items.ids
    || itemValues
  )
    ? {
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
    : undefined
  const sectionValues = buildSectionValueDelta({
    previous,
    next,
    changedSections,
    removedSections,
    rebuild: rebuild || Boolean(sectionChange?.rebuild)
  })
  const sectionSummary = buildSectionSummaryDelta({
    previous,
    next,
    changedSections: changedSummarySections,
    removedSections: removedSummarySections,
    rebuild: rebuild || Boolean(summaryChange?.rebuild)
  })
  const sections = (
    rebuild
    || previous?.sections.ids !== next.sections.ids
    || sectionValues
    || sectionSummary
  )
    ? {
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
        ...(sectionSummary
          ? {
              summary: sectionSummary
            }
          : {})
      }
    : undefined
  const fieldsChanged = rebuild || previous?.fields !== next.fields
  const fields = fieldsChanged
    ? {
        all: {
          ids: next.fields.ids,
          values: buildFieldCollectionDelta({
            previous: previous?.fields.all,
            next: next.fields.all
          })
        },
        custom: {
          ids: next.fields.custom.map(field => field.id),
          values: buildFieldCollectionDelta({
            previous: previous?.fields.custom,
            next: next.fields.custom
          })
        }
      }
    : undefined
  const queryChanged = rebuild || previous?.query !== next.query
  const querySortDir = queryChanged
    ? buildMapValueDelta<FieldId, SortDirection>({
        previous: previous?.query.sortDir,
        next: next.query.sortDir
      })
    : undefined
  const query = queryChanged
    ? {
        search: next.query.search,
        filters: next.query.filters,
        sort: next.query.sort,
        group: next.query.group,
        grouped: next.query.grouped,
        groupFieldId: next.query.groupFieldId,
        filterFieldIds: next.query.filterFieldIds,
        sortFieldIds: next.query.sortFieldIds,
        ...(querySortDir
          ? {
              sortDir: querySortDir
            }
          : {})
      }
    : undefined
  const tableChanged = rebuild || previous?.table !== next.table
  const tableCalc = tableChanged
    ? buildMapValueDelta<FieldId, CalculationMetric>({
        previous: previous?.table.calc,
        next: next.table.calc
      })
    : undefined
  const table = (
    tableChanged
    || input.previousLayout !== tableLayout
  )
    ? {
        ...(tableChanged
          ? {
              wrap: next.table.wrap,
              showVerticalLines: next.table.showVerticalLines
            }
          : {}),
        ...(tableCalc
          ? {
              calc: tableCalc
            }
          : {}),
        ...(input.previousLayout !== tableLayout
          ? {
              layout: tableLayout
            }
          : {})
      }
    : undefined
  const active = {
    ...(rebuild || previous?.view !== next.view
      ? {
          view: {
            ready: true,
            id: next.view.id,
            type: next.view.type,
            value: next.view
          }
        }
      : {}),
    ...(items
      ? {
          items
        }
      : {}),
    ...(sections
      ? {
          sections
        }
      : {}),
    ...(fields
      ? {
          fields
        }
      : {}),
    ...(query
      ? {
          query
        }
      : {}),
    ...(table
      ? {
          table
        }
      : {}),
    ...(rebuild || previous?.gallery !== next.gallery
      ? {
          gallery: next.gallery
        }
      : {}),
    ...(rebuild || previous?.kanban !== next.kanban
      ? {
          kanban: next.kanban
        }
      : {})
  } satisfies SourceDelta['active']

  return {
    active: Object.keys(active).length
      ? active
      : undefined,
    tableLayout
  }
}

export const projectSourceOutput = (input: {
  document: DataDoc
  impact: CommitImpact
  previousView?: ViewState
  nextView?: ViewState
  snapshotChange?: SnapshotChange
  previousLayout: TableLayoutState | null
}): {
  sourceDelta: SourceDelta
  tableLayout: TableLayoutState | null
} => {
  const document = projectDocumentDelta({
    impact: input.impact,
    document: input.document
  })
  const active = projectActiveDelta({
    previous: input.previousView,
    next: input.nextView,
    snapshotChange: input.snapshotChange,
    previousLayout: input.previousLayout
  })

  return {
    sourceDelta: {
      ...(document
        ? {
            document
          }
        : {}),
      ...(active.active
        ? {
            active: active.active
          }
        : {})
    },
    tableLayout: active.tableLayout
  }
}
