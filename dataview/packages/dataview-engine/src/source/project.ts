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
  CommitImpact,
  CustomField,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import {
  EMPTY_VIEW_GROUP_PROJECTION as EMPTY_GROUP
} from '@dataview/engine/contracts'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  EntityDelta,
  FilterRuleProjection,
  ItemId,
  Section,
  SectionKey,
  SourceDelta,
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

const entityDelta = <TKey, TValue>(input: {
  ids?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue | undefined])[]
  remove?: readonly TKey[]
}): EntityDelta<TKey, TValue> | undefined => (
  input.ids !== undefined || input.set?.length || input.remove?.length
    ? {
        ...(input.ids !== undefined
          ? {
              ids: input.ids
            }
          : {}),
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
}): EntityDelta<TKey, TValue> | undefined => entityDelta({
  ...(input.idsChanged
    ? {
        ids: input.ids
      }
    : {}),
  set: input.changed.map(key => [key, input.value(key)] as const),
  remove: input.removed
})

const buildFieldCollectionDelta = <TField extends Field | CustomField>(input: {
  previous?: readonly TField[]
  next: readonly TField[]
}): EntityDelta<FieldId, TField> | undefined => entityDelta({
  ids: input.next.map(field => field.id),
  set: input.next.map(field => [field.id, field] as const),
  remove: input.previous
    ? collectRemovedKeys(
        input.previous.map(field => field.id),
        input.next.map(field => field.id)
      )
    : []
})

const buildItemDelta = (input: {
  previous?: ViewState
  next: ViewState
  changedSections: readonly SectionKey[]
  removedSections: readonly SectionKey[]
  rebuild: boolean
}): EntityDelta<ItemId, ViewItem> | undefined => {
  if (input.rebuild || !input.previous) {
    return entityDelta<ItemId, ViewItem>({
      ids: input.next.items.ids,
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
    ...(input.previous?.items.ids !== input.next.items.ids
      ? {
          ids: input.next.items.ids
        }
      : {}),
    set: [...set.entries()],
    remove: [...remove]
  })
}

const buildSectionDelta = (input: {
  previous?: ViewState
  next: ViewState
  changedSections: readonly SectionKey[]
  removedSections: readonly SectionKey[]
  rebuild: boolean
}): EntityDelta<SectionKey, Section> | undefined => {
  if (input.rebuild || !input.previous) {
    return entityDelta<SectionKey, Section>({
      ids: input.next.sections.ids,
      set: input.next.sections.ids.map(sectionKey => [sectionKey, input.next.sections.get(sectionKey)] as const)
    })
  }

  return entityDelta<SectionKey, Section>({
    ...(input.previous.sections.ids !== input.next.sections.ids
      ? {
          ids: input.next.sections.ids
        }
      : {}),
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
}): EntityDelta<SectionKey, CalculationCollection | undefined> | undefined => {
  if (input.rebuild || !input.previous) {
    return entityDelta<SectionKey, CalculationCollection | undefined>({
      ids: input.next.sections.ids,
      set: input.next.sections.ids.map(sectionKey => [sectionKey, input.next.summaries.get(sectionKey)] as const)
    })
  }

  return entityDelta<SectionKey, CalculationCollection | undefined>({
    ...(input.previous.sections.ids !== input.next.sections.ids
      ? {
          ids: input.next.sections.ids
        }
      : {}),
    set: input.changedSections.map(sectionKey => [sectionKey, input.next.summaries.get(sectionKey)] as const),
    remove: input.removedSections
  })
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
}): SourceDelta['active'] => {
  if (!input.previous) {
    return undefined
  }

  const previous = input.previous
  return {
    view: {
      ready: false,
      id: undefined,
      type: undefined,
      value: undefined
    },
    items: entityDelta({
      ids: EMPTY_ITEM_IDS,
      remove: previous.items.ids
    }),
    sections: {
      records: entityDelta({
        ids: EMPTY_SECTION_KEYS,
        remove: previous.sections.ids
      }),
      summary: entityDelta({
        ids: EMPTY_SECTION_KEYS,
        remove: previous.sections.ids
      })
    },
    fields: {
      all: buildFieldCollectionDelta({
        previous: previous.fields.all,
        next: EMPTY_FIELDS
      }),
      custom: buildFieldCollectionDelta({
        previous: previous.fields.custom,
        next: EMPTY_CUSTOM_FIELDS
      })
    },
    query: EMPTY_QUERY,
    table: EMPTY_TABLE,
    gallery: EMPTY_GALLERY,
    kanban: EMPTY_KANBAN
  }
}

const projectActiveDelta = (input: {
  previous?: ViewState
  next?: ViewState
  snapshotChange?: SnapshotChange
}): SourceDelta['active'] => {
  if (!input.next) {
    return projectInactiveActiveDelta({
      previous: input.previous
    })
  }

  const next = input.next
  const previous = input.previous
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

  const items = buildItemDelta({
    previous,
    next,
    changedSections,
    removedSections,
    rebuild: rebuild || Boolean(sectionChange?.rebuild)
  })
  const sectionRecords = buildSectionDelta({
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
  const fields = rebuild || previous?.fields !== next.fields
    ? {
        all: buildFieldCollectionDelta({
          previous: previous?.fields.all,
          next: next.fields.all
        }),
        custom: buildFieldCollectionDelta({
          previous: previous?.fields.custom,
          next: next.fields.custom
        })
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
    ...(rebuild || previous?.query !== next.query
      ? {
          query: next.query
        }
      : {}),
    ...(rebuild || previous?.table !== next.table
      ? {
          table: next.table
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
      : {}),
    ...(items
      ? {
          items
        }
      : {}),
    ...(sectionRecords || sectionSummary
      ? {
          sections: {
            ...(sectionRecords
              ? {
                  records: sectionRecords
                }
              : {}),
            ...(sectionSummary
              ? {
                  summary: sectionSummary
                }
              : {})
          }
        }
      : {}),
    ...(fields?.all || fields?.custom
      ? {
          fields: {
            ...(fields.all
              ? {
                  all: fields.all
                }
              : {}),
            ...(fields.custom
              ? {
                  custom: fields.custom
                }
              : {})
          }
        }
      : {})
  } satisfies SourceDelta['active']

  return Object.keys(active).length
    ? active
    : undefined
}

export const projectSourceOutput = (input: {
  document: DataDoc
  impact: CommitImpact
  previousView?: ViewState
  nextView?: ViewState
  snapshotChange?: SnapshotChange
}): SourceDelta => {
  const document = projectDocumentDelta({
    impact: input.impact,
    document: input.document
  })
  const active = projectActiveDelta({
    previous: input.previousView,
    next: input.nextView,
    snapshotChange: input.snapshotChange
  })

  return {
    ...(document
      ? {
          document
        }
      : {}),
    ...(active
      ? {
          active
        }
      : {})
  }
}
