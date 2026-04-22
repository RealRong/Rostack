import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CardLayout,
  CardSize,
  CustomField,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal, store } from '@shared/core'
import type {
  ActiveDelta,
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  FieldList,
  ItemId,
  ItemPlacement,
  Section,
  SectionKey,
  ViewState
} from '@dataview/engine'
import type {
  ActiveSource,
  ItemSource,
  SectionSource
} from '@dataview/runtime/source/contracts'
import {
  applyEntityDelta,
  createEntitySourceRuntime,
  resetEntityRuntime,
  type EntitySourceRuntime
} from '@dataview/runtime/source/patch'

interface ItemValue {
  recordId: RecordId
  sectionKey: SectionKey
  placement: ItemPlacement
}

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
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

interface SectionSourceRuntime {
  source: SectionSource
  ids: store.ValueStore<readonly SectionKey[]>
  values: store.KeyedStore<SectionKey, Section | undefined>
  clear(): void
}

interface SummarySourceRuntime {
  source: store.KeyedReadStore<SectionKey, CalculationCollection | undefined>
  values: store.KeyedStore<SectionKey, CalculationCollection | undefined>
  clear(): void
}

interface ItemSourceRuntime {
  source: ItemSource
  ids: store.ValueStore<readonly ItemId[]>
  table: ReturnType<typeof store.createKeyTableStore<ItemId, ItemValue>>
  clear(): void
}

export interface ActiveSourceRuntime {
  source: ActiveSource
  viewId: store.ValueStore<ViewId | undefined>
  viewType: store.ValueStore<View['type'] | undefined>
  viewCurrent: store.ValueStore<View | undefined>
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
  fieldsAll: EntitySourceRuntime<FieldId, Field>
  fieldsCustom: EntitySourceRuntime<FieldId, CustomField>
  clear(): void
}

const createRecordListStore = () => store.createValueStore<readonly RecordId[]>({
  initial: EMPTY_RECORD_IDS,
  isEqual: equal.sameOrder
})

const createSectionSourceRuntime = (): SectionSourceRuntime => {
  const ids = store.createValueStore<readonly SectionKey[]>({
    initial: EMPTY_SECTION_KEYS,
    isEqual: equal.sameOrder
  })
  const values = store.createKeyedStore<SectionKey, Section | undefined>({
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
      ids.set(EMPTY_SECTION_KEYS)
      values.clear()
    }
  }
}

const createSummarySourceRuntime = (): SummarySourceRuntime => {
  const values = store.createKeyedStore<SectionKey, CalculationCollection | undefined>({
    emptyValue: undefined
  })

  return {
    source: {
      get: values.get,
      subscribe: values.subscribe,
      isEqual: values.isEqual
    },
    values,
    clear: () => {
      values.clear()
    }
  }
}

const createItemSourceRuntime = (): ItemSourceRuntime => {
  const ids = store.createValueStore<readonly ItemId[]>({
    initial: EMPTY_ITEM_IDS,
    isEqual: equal.sameOrder
  })
  const table = store.createKeyTableStore<ItemId, ItemValue>()
  const recordId = table.project.field(value => value?.recordId)
  const sectionKey = table.project.field(value => value?.sectionKey)
  const placement = table.project.field(value => value?.placement)

  return {
    source: {
      ids,
      read: {
        recordId,
        sectionKey,
        placement
      }
    },
    ids,
    table,
    clear: () => {
      ids.set(EMPTY_ITEM_IDS)
      table.write.clear()
    }
  }
}

const readItemValue = (
  snapshot: ViewState,
  itemId: ItemId
): ItemValue | undefined => {
  const placement = snapshot.items.read.placement(itemId)
  if (!placement) {
    return undefined
  }

  return {
    recordId: placement.recordId,
    sectionKey: placement.sectionKey,
    placement
  }
}

const collectSectionItemValues = (
  snapshot: ViewState
): readonly (readonly [ItemId, ItemValue])[] => {
  const pairs: Array<readonly [ItemId, ItemValue]> = []

  snapshot.sections.all.forEach(section => {
    section.itemIds.forEach(itemId => {
      const value = readItemValue(snapshot, itemId)
      if (!value) {
        return
      }

      pairs.push([itemId, value] as const)
    })
  })

  return pairs
}

const resetActiveFields = (input: {
  runtime: ActiveSourceRuntime
  fields: FieldList
}) => {
  resetEntityRuntime(input.runtime.fieldsAll, {
    ids: input.fields.ids,
    values: input.fields.all.map(field => [field.id, field] as const)
  })
  resetEntityRuntime(input.runtime.fieldsCustom, {
    ids: input.fields.custom.map(field => field.id),
    values: input.fields.custom.map(field => [field.id, field] as const)
  })
}

export const createActiveSourceRuntime = (): ActiveSourceRuntime => {
  const viewId = store.createValueStore<ViewId | undefined>(undefined)
  const viewType = store.createValueStore<View['type'] | undefined>(undefined)
  const viewCurrent = store.createValueStore<View | undefined>(undefined)
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
  const fieldsAll = createEntitySourceRuntime<FieldId, Field>(EMPTY_FIELD_IDS)
  const fieldsCustom = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)

  return {
    source: {
      view: {
        id: viewId,
        type: viewType,
        current: viewCurrent
      },
      query,
      table,
      gallery,
      kanban,
      records: {
        matched: recordsMatched,
        ordered: recordsOrdered,
        visible: recordsVisible
      },
      items: items.source,
      sections: sections.source,
      summaries: summaries.source,
      fields: {
        all: fieldsAll.source,
        custom: fieldsCustom.source
      }
    },
    viewId,
    viewType,
    viewCurrent,
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
    fieldsAll,
    fieldsCustom,
    clear: () => {
      resetActiveSource({
        runtime: {
          viewId,
          viewType,
          viewCurrent,
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
          fieldsAll,
          fieldsCustom
        } as ActiveSourceRuntime,
        snapshot: undefined
      })
    }
  }
}

export const resetActiveSource = (input: {
  runtime: Pick<ActiveSourceRuntime,
    | 'viewId'
    | 'viewType'
    | 'viewCurrent'
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
    | 'fieldsAll'
    | 'fieldsCustom'
  >
  snapshot?: ViewState
}) => {
  const snapshot = input.snapshot
  if (!snapshot) {
    input.runtime.viewId.set(undefined)
    input.runtime.viewType.set(undefined)
    input.runtime.viewCurrent.set(undefined)
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
    input.runtime.fieldsAll.clear()
    input.runtime.fieldsCustom.clear()
    return
  }

  input.runtime.viewId.set(snapshot.view.id)
  input.runtime.viewType.set(snapshot.view.type)
  input.runtime.viewCurrent.set(snapshot.view)
  input.runtime.query.set(snapshot.query)
  input.runtime.table.set(snapshot.table)
  input.runtime.gallery.set(snapshot.gallery)
  input.runtime.kanban.set(snapshot.kanban)
  input.runtime.recordsMatched.set(snapshot.records.matched)
  input.runtime.recordsOrdered.set(snapshot.records.ordered)
  input.runtime.recordsVisible.set(snapshot.records.visible)
  input.runtime.items.ids.set(snapshot.items.ids)
  input.runtime.items.table.write.clear()
  const itemValues = collectSectionItemValues(snapshot)
  if (itemValues.length) {
    input.runtime.items.table.write.apply({
      set: itemValues
    })
  }
  input.runtime.sections.ids.set(snapshot.sections.ids)
  input.runtime.sections.values.clear()
  if (snapshot.sections.all.length) {
    input.runtime.sections.values.patch({
      set: snapshot.sections.all.map(section => [section.key, section] as const)
    })
  }
  input.runtime.summaries.values.clear()
  if (snapshot.sections.ids.length) {
    input.runtime.summaries.values.patch({
      set: snapshot.sections.ids.flatMap(sectionKey => {
        const summary = snapshot.summaries.get(sectionKey)
        return summary
          ? [[sectionKey, summary] as const]
          : []
      })
    })
  }
  resetActiveFields({
    runtime: input.runtime as ActiveSourceRuntime,
    fields: snapshot.fields
  })
}

const applyItemDelta = (input: {
  delta: ActiveDelta['items']
  runtime: ItemSourceRuntime
  snapshot: ViewState
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.list) {
    input.runtime.ids.set(input.snapshot.items.ids)
  }

  let set: Array<readonly [ItemId, ItemValue]> | undefined
  const update = input.delta.update
  if (update?.length) {
    set = []
    for (let index = 0; index < update.length; index += 1) {
      const itemId = update[index]!
      const value = readItemValue(input.snapshot, itemId)
      if (!value) {
        continue
      }

      set.push([itemId, value] as const)
    }
  }

  if (!set?.length && !input.delta.remove?.length) {
    return
  }

  input.runtime.table.write.apply({
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(input.delta.remove?.length
      ? {
          remove: input.delta.remove
        }
      : {})
  })
}

export const applyActiveDelta = (input: {
  runtime: Pick<ActiveSourceRuntime,
    | 'viewId'
    | 'viewType'
    | 'viewCurrent'
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
    | 'fieldsAll'
    | 'fieldsCustom'
  >
  delta: ActiveDelta | undefined
  snapshot?: ViewState
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.reset) {
    resetActiveSource(input)
    return
  }

  const snapshot = input.snapshot
  if (!snapshot) {
    return
  }

  if (input.delta.view) {
    input.runtime.viewId.set(snapshot.view.id)
    input.runtime.viewType.set(snapshot.view.type)
    input.runtime.viewCurrent.set(snapshot.view)
  }

  if (input.delta.query) {
    input.runtime.query.set(snapshot.query)
  }
  if (input.delta.table) {
    input.runtime.table.set(snapshot.table)
  }
  if (input.delta.gallery) {
    input.runtime.gallery.set(snapshot.gallery)
  }
  if (input.delta.kanban) {
    input.runtime.kanban.set(snapshot.kanban)
  }

  if (input.delta.records?.matched) {
    input.runtime.recordsMatched.set(snapshot.records.matched)
  }
  if (input.delta.records?.ordered) {
    input.runtime.recordsOrdered.set(snapshot.records.ordered)
  }
  if (input.delta.records?.visible) {
    input.runtime.recordsVisible.set(snapshot.records.visible)
  }

  applyItemDelta({
    delta: input.delta.items,
    runtime: input.runtime.items,
    snapshot
  })
  applyEntityDelta({
    delta: input.delta.sections,
    runtime: input.runtime.sections,
    readIds: () => snapshot.sections.ids,
    readValue: sectionKey => snapshot.sections.get(sectionKey)
  })
  applyEntityDelta({
    delta: input.delta.summaries,
    runtime: {
      values: input.runtime.summaries.values
    },
    readIds: () => snapshot.sections.ids,
    readValue: sectionKey => snapshot.summaries.get(sectionKey)
  })
  applyEntityDelta({
    delta: input.delta.fields?.all,
    runtime: input.runtime.fieldsAll,
    readIds: () => snapshot.fields.ids,
    readValue: fieldId => snapshot.fields.get(fieldId)
  })
  applyEntityDelta({
    delta: input.delta.fields?.custom,
    runtime: input.runtime.fieldsCustom,
    readIds: () => snapshot.fields.custom.map(field => field.id),
    readValue: fieldId => snapshot.fields.get(fieldId) as CustomField | undefined
  })
}
