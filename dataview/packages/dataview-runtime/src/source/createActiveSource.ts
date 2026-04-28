import type { CalculationCollection } from '@dataview/core/view'
import type {
  CardLayout,
  CardSize,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types'
import { collection, equal, store } from '@shared/core'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  FieldList,
  ItemId,
  ItemList,
  ItemPlacement,
  Section,
  SectionId,
  SectionList,
  ViewState
} from '@dataview/engine'
import type {
  ActiveSource,
  ItemSource,
  SectionSource
} from '@dataview/runtime/source/contracts'
import {
  createSourceTableRuntime,
  createEntitySourceRuntime,
  resetEntityRuntime,
  resetSourceTableRuntime,
  type EntitySourceRuntime,
  type SourceTableRuntime
} from '@dataview/runtime/source/patch'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionId[]
const EMPTY_QUERY: ActiveViewQuery = {
  search: {
    query: ''
  },
  filters: {
    rules: []
  },
  sort: {
    rules: []
  }
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

type SectionSourceRuntime = EntitySourceRuntime<SectionId, Section>
type SummarySourceRuntime = SourceTableRuntime<SectionId, CalculationCollection>

interface ItemSourceRuntime {
  source: Pick<ItemSource, 'ids' | 'read'>
  ids: store.ValueStore<readonly ItemId[]>
  store: store.KeyedStore<ItemId, ItemPlacement | undefined>
  clear(): void
}

export interface ActiveSourceRuntime {
  source: ActiveSource
  viewId: store.ValueStore<ViewId | undefined>
  viewType: store.ValueStore<View['type'] | undefined>
  view: store.ValueStore<View | undefined>
  query: store.ValueStore<ActiveViewQuery>
  table: store.ValueStore<ActiveViewTable>
  gallery: store.ValueStore<ActiveViewGallery>
  kanban: store.ValueStore<ActiveViewKanban>
  recordsMatched: store.ValueStore<readonly RecordId[]>
  recordsOrdered: store.ValueStore<readonly RecordId[]>
  recordsVisible: store.ValueStore<readonly RecordId[]>
  items: ItemSourceRuntime
  sections: SectionSourceRuntime
  summaries: SummarySourceRuntime
  fields: EntitySourceRuntime<FieldId, Field>
  clear(): void
}

const createRecordListStore = () => store.createValueStore<readonly RecordId[]>({
  initial: EMPTY_RECORD_IDS,
  isEqual: equal.sameOrder
})

const createItemListStore = (input: {
  source: Pick<ItemSource, 'ids' | 'read'>
}): store.ReadStore<ItemList> => {
  let previous: ItemList | undefined

  return store.createDerivedStore<ItemList>({
    get: () => {
      const ids = store.read(input.source.ids)
      if (previous?.ids === ids) {
        return previous
      }

      const next: ItemList = {
        ids,
        count: ids.length,
        order: collection.createOrderedAccess(ids),
        read: {
          record: itemId => store.read(input.source.read.record, itemId),
          section: itemId => store.read(input.source.read.section, itemId),
          placement: itemId => store.read(input.source.read.placement, itemId)
        }
      }

      previous = next
      return next
    },
    isEqual: Object.is
  })
}

const createSectionListStore = (input: {
  source: Pick<SectionSource, 'ids' | 'get' | 'subscribe' | 'isEqual'>
}): store.ReadStore<SectionList> => {
  let previous: SectionList | undefined

  return store.createDerivedStore<SectionList>({
    get: () => {
      const ids = store.read(input.source.ids)
      const canReuse = Boolean(
        previous
        && previous.ids === ids
        && previous.all.length === ids.length
        && ids.every((sectionId, index) => (
          previous!.all[index] === store.read(input.source, sectionId)
        ))
      )
      if (canReuse) {
        return previous as SectionList
      }

      const all = collection.presentValues(
        ids,
        sectionId => store.read(input.source, sectionId)
      )
      const next = collection.createOrderedKeyedCollection({
        ids,
        all,
        get: sectionId => store.read(input.source, sectionId)
      })

      previous = next
      return next
    },
    isEqual: Object.is
  })
}

const createFieldListStore = (input: {
  fields: EntitySourceRuntime<FieldId, Field>['source']
}): store.ReadStore<FieldList> => {
  let previous: FieldList | undefined

  return store.createDerivedStore<FieldList>({
    get: () => {
      const ids = store.read(input.fields.ids)
      const canReuse = Boolean(
        previous
        && previous.ids === ids
        && previous.all.length === ids.length
        && ids.every((fieldId, index) => (
          previous!.all[index] === store.read(input.fields, fieldId)
        ))
      )
      if (canReuse) {
        return previous as FieldList
      }

      const all = collection.presentValues(
        ids,
        fieldId => store.read(input.fields, fieldId)
      )
      const next = collection.createOrderedKeyedCollection({
        ids,
        all,
        get: fieldId => store.read(input.fields, fieldId)
      })

      previous = next
      return next
    },
    isEqual: Object.is
  })
}

const createSectionSourceRuntime = (): SectionSourceRuntime =>
  createEntitySourceRuntime<SectionId, Section>(EMPTY_SECTION_KEYS)

const createSummarySourceRuntime = (): SummarySourceRuntime =>
  createSourceTableRuntime<SectionId, CalculationCollection>()

const itemPlacementReadSpec = {
  record: {
    read: (placement: ItemPlacement | undefined) => placement?.recordId,
    isEqual: Object.is
  },
  section: {
    read: (placement: ItemPlacement | undefined) => placement?.sectionId,
    isEqual: Object.is
  },
  placement: {
    read: (placement: ItemPlacement | undefined) => placement,
    isEqual: equal.sameJsonValue
  }
} as const

const createPlacementReadStore = <Projected,>(input: {
  values: store.KeyedReadStore<ItemId, ItemPlacement | undefined>
  spec: {
    read: (placement: ItemPlacement | undefined) => Projected
    isEqual?: (left: Projected, right: Projected) => boolean
  }
}): store.KeyedReadStore<ItemId, Projected> => store.createKeyedDerivedStore({
  get: itemId => input.spec.read(
    store.read(input.values, itemId)
  ),
  ...(input.spec.isEqual
    ? {
        isEqual: input.spec.isEqual
      }
    : {})
})

const createItemSourceRuntime = (): ItemSourceRuntime => {
  const ids = store.createValueStore<readonly ItemId[]>({
    initial: EMPTY_ITEM_IDS,
    isEqual: equal.sameOrder
  })
  const placements = createSourceTableRuntime<ItemId, ItemPlacement>({
    isEqual: equal.sameJsonValue
  })

  return {
    source: {
      ids,
      read: {
        record: createPlacementReadStore({
          values: placements.source,
          spec: itemPlacementReadSpec.record
        }),
        section: createPlacementReadStore({
          values: placements.source,
          spec: itemPlacementReadSpec.section
        }),
        placement: createPlacementReadStore({
          values: placements.source,
          spec: itemPlacementReadSpec.placement
        })
      }
    },
    ids,
    store: placements.store,
    clear: () => {
      ids.set(EMPTY_ITEM_IDS)
      placements.clear()
    }
  }
}

const readItemPlacement = (
  snapshot: ViewState,
  itemId: ItemId
): ItemPlacement | undefined => snapshot.items.read.placement(itemId)

const collectSectionItemPlacements = (
  snapshot: ViewState
): readonly (readonly [ItemId, ItemPlacement])[] => {
  const pairs: Array<readonly [ItemId, ItemPlacement]> = []

  snapshot.sections.all.forEach(section => {
    section.itemIds.forEach(itemId => {
      const placement = readItemPlacement(snapshot, itemId)
      if (!placement) {
        return
      }

      pairs.push([itemId, placement] as const)
    })
  })

  return pairs
}

const resetActiveFields = (input: {
  runtime: Pick<ActiveSourceRuntime, 'fields'>
  fields: FieldList
}) => {
  resetEntityRuntime(input.runtime.fields, {
    ids: input.fields.ids,
    values: input.fields.all.map(field => [field.id, field] as const)
  })
}

export const createActiveSourceRuntime = (): ActiveSourceRuntime => {
  const viewId = store.createValueStore<ViewId | undefined>(undefined)
  const viewType = store.createValueStore<View['type'] | undefined>(undefined)
  const view = store.createValueStore<View | undefined>(undefined)
  const query = store.createValueStore<ActiveViewQuery>(EMPTY_QUERY)
  const table = store.createValueStore<ActiveViewTable>(EMPTY_TABLE)
  const gallery = store.createValueStore<ActiveViewGallery>(EMPTY_GALLERY)
  const kanban = store.createValueStore<ActiveViewKanban>(EMPTY_KANBAN)
  const recordsMatched = createRecordListStore()
  const recordsOrdered = createRecordListStore()
  const recordsVisible = createRecordListStore()
  const items = createItemSourceRuntime()
  const sections = createSectionSourceRuntime()
  const summaries = createSummarySourceRuntime()
  const fields = createEntitySourceRuntime<FieldId, Field>(EMPTY_FIELD_IDS)
  const itemList = createItemListStore({
    source: items.source
  })
  const sectionList = createSectionListStore({
    source: sections.source
  })
  const fieldList = createFieldListStore({
    fields: fields.source
  })

  return {
    source: {
      view,
      viewId,
      viewType,
      query,
      table,
      gallery,
      kanban,
      records: {
        matched: recordsMatched,
        ordered: recordsOrdered,
        visible: recordsVisible
      },
      items: {
        ...items.source,
        list: itemList
      },
      sections: {
        ...sections.source,
        list: sectionList
      },
      summaries: summaries.source,
      fields: {
        ...fields.source,
        list: fieldList
      }
    },
    viewId,
    viewType,
    view,
    query,
    table,
    gallery,
    kanban,
    recordsMatched,
    recordsOrdered,
    recordsVisible,
    items,
    sections,
    summaries,
    fields,
    clear: () => {
      viewId.set(undefined)
      viewType.set(undefined)
      view.set(undefined)
      query.set(EMPTY_QUERY)
      table.set(EMPTY_TABLE)
      gallery.set(EMPTY_GALLERY)
      kanban.set(EMPTY_KANBAN)
      recordsMatched.set(EMPTY_RECORD_IDS)
      recordsOrdered.set(EMPTY_RECORD_IDS)
      recordsVisible.set(EMPTY_RECORD_IDS)
      items.clear()
      sections.clear()
      summaries.clear()
      fields.clear()
    }
  }
}

export const resetActiveSource = (input: {
  runtime: Pick<ActiveSourceRuntime,
    | 'viewId'
    | 'viewType'
    | 'view'
    | 'query'
    | 'table'
    | 'gallery'
    | 'kanban'
    | 'recordsMatched'
    | 'recordsOrdered'
    | 'recordsVisible'
    | 'items'
    | 'sections'
    | 'summaries'
    | 'fields'
  >
  snapshot?: ViewState
}) => {
  const snapshot = input.snapshot
  if (!snapshot) {
    input.runtime.viewId.set(undefined)
    input.runtime.viewType.set(undefined)
    input.runtime.view.set(undefined)
    input.runtime.query.set(EMPTY_QUERY)
    input.runtime.table.set(EMPTY_TABLE)
    input.runtime.gallery.set(EMPTY_GALLERY)
    input.runtime.kanban.set(EMPTY_KANBAN)
    input.runtime.recordsMatched.set(EMPTY_RECORD_IDS)
    input.runtime.recordsOrdered.set(EMPTY_RECORD_IDS)
    input.runtime.recordsVisible.set(EMPTY_RECORD_IDS)
    input.runtime.items.clear()
    input.runtime.sections.clear()
    input.runtime.summaries.clear()
    input.runtime.fields.clear()
    return
  }

  input.runtime.viewId.set(snapshot.view.id)
  input.runtime.viewType.set(snapshot.view.type)
  input.runtime.view.set(snapshot.view)
  input.runtime.query.set(snapshot.query)
  input.runtime.table.set(snapshot.table)
  input.runtime.gallery.set(snapshot.gallery)
  input.runtime.kanban.set(snapshot.kanban)
  input.runtime.recordsMatched.set(snapshot.records.matched)
  input.runtime.recordsOrdered.set(snapshot.records.ordered)
  input.runtime.recordsVisible.set(snapshot.records.visible)
  input.runtime.items.ids.set(snapshot.items.ids)
  const itemPlacements = collectSectionItemPlacements(snapshot)
  resetSourceTableRuntime(input.runtime.items, itemPlacements)
  resetEntityRuntime(input.runtime.sections, {
    ids: snapshot.sections.ids,
    values: snapshot.sections.all.map(section => [section.id, section] as const)
  })
  resetSourceTableRuntime(input.runtime.summaries, (
    snapshot.sections.ids.flatMap(sectionId => {
      const summary = snapshot.summaries.get(sectionId)
      return summary
        ? [[sectionId, summary] as const]
        : []
    })
  ))
  resetActiveFields({
    runtime: input.runtime,
    fields: snapshot.fields
  })
}
