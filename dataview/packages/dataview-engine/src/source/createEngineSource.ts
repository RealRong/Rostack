import type {
  CardLayout,
  CardSize,
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  RecordId,
  ValueRef,
  View,
  ViewId
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import type {
  EngineCommit
} from '@dataview/engine/contracts/write'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  EngineSource,
  EntitySource,
  ListedEntitySource,
  SectionSource
} from '@dataview/engine/contracts/source'
import type {
  FieldList,
  ItemId,
  ItemList,
  ItemPlacement,
  Section,
  SectionId,
  SectionList
} from '@dataview/engine/contracts/shared'
import {
  collection,
  equal,
  store
} from '@shared/core'
import type {
  createDataviewProjection
} from '@dataview/engine/projection'

type ProjectionRuntime = ReturnType<typeof createDataviewProjection>
type SubscribeSource<TSource> = (listener: (next: TSource) => void) => () => void

const EMPTY_RECORD_IDS = [] as readonly RecordId[]
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
const TITLE_FIELD: Field = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true
}

const VALUE_ID_SEPARATOR = '\u0000'

const valueId = (
  value: ValueRef
): string => `${value.recordId}${VALUE_ID_SEPARATOR}${value.fieldId}`

const hasOwn = (
  value: Record<string, unknown>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const readDocumentField = (
  document: DataDoc,
  fieldId: FieldId
): Field | undefined => fieldId === TITLE_FIELD_ID
  ? TITLE_FIELD
  : document.fields.byId[fieldId]

const readDocumentValue = (
  document: DataDoc,
  ref: ValueRef
): unknown => {
  const record = document.records.byId[ref.recordId]
  if (!record) {
    return undefined
  }

  return ref.fieldId === TITLE_FIELD_ID
    ? record.title
    : record.values[ref.fieldId]
}

const createSelectedStore = <TSource, TValue>(input: {
  current: () => TSource
  subscribe: SubscribeSource<TSource>
  select: (source: TSource) => TValue
  isEqual?: (left: TValue, right: TValue) => boolean
}) => {
  const isEqual = input.isEqual ?? Object.is

  return store.createReadStore<TValue>({
    get: () => input.select(input.current()),
    subscribe: (listener) => {
      let previous = input.select(input.current())
      return input.subscribe((nextSource) => {
        const next = input.select(nextSource)
        if (isEqual(previous, next)) {
          return
        }

        previous = next
        listener()
      })
    },
    isEqual
  })
}

const createSelectedKeyedStore = <TSource, TKey, TValue>(input: {
  current: () => TSource
  subscribe: SubscribeSource<TSource>
  select: (source: TSource, key: TKey) => TValue
  isEqual?: (left: TValue, right: TValue) => boolean
}) => {
  const isEqual = input.isEqual ?? Object.is

  return store.keyed<TKey, TValue>({
    get: (key) => input.select(input.current(), key),
    subscribe: (key, listener) => {
      let previous = input.select(input.current(), key)
      return input.subscribe((nextSource) => {
        const next = input.select(nextSource, key)
        if (isEqual(previous, next)) {
          return
        }

        previous = next
        listener()
      })
    },
    isEqual
  })
}

const createSelectedEntitySource = <TSource, TKey extends string | number, TValue>(input: {
  current: () => TSource
  subscribe: SubscribeSource<TSource>
  readIds: (source: TSource) => readonly TKey[]
  readValue: (source: TSource, key: TKey) => TValue | undefined
  valueEqual?: (left: TValue | undefined, right: TValue | undefined) => boolean
  idsEqual?: (left: readonly TKey[], right: readonly TKey[]) => boolean
}): EntitySource<TKey, TValue> => ({
  ids: createSelectedStore({
    current: input.current,
    subscribe: input.subscribe,
    select: input.readIds,
    isEqual: input.idsEqual ?? equal.sameOrder
  }),
  ...createSelectedKeyedStore({
    current: input.current,
    subscribe: input.subscribe,
    select: input.readValue,
    isEqual: input.valueEqual
  })
})

const createOrderedKeyedListStore = <TId, T>(input: {
  ids: store.ReadStore<readonly TId[]>
  values: store.KeyedReadStore<TId, T | undefined>
}): store.ReadStore<collection.OrderedKeyedCollection<TId, T>> => {
  let previous: collection.OrderedKeyedCollection<TId, T> | undefined

  return store.createDerivedStore({
    get: () => {
      const ids = store.read(input.ids)
      const canReuse = Boolean(
        previous
        && previous.ids === ids
        && previous.all.length === ids.length
        && ids.every((id, index) => previous!.all[index] === store.read(input.values, id))
      )
      if (canReuse) {
        return previous as collection.OrderedKeyedCollection<TId, T>
      }

      const all = collection.presentValues(
        ids,
        (id) => store.read(input.values, id)
      )
      const next = collection.createOrderedKeyedCollection({
        ids,
        all,
        get: (id) => store.read(input.values, id)
      })

      previous = next
      return next
    },
    isEqual: Object.is
  })
}

const createItemListStore = (input: {
  ids: store.ReadStore<readonly ItemId[]>
  record: store.KeyedReadStore<ItemId, RecordId | undefined>
  section: store.KeyedReadStore<ItemId, SectionId | undefined>
  placement: store.KeyedReadStore<ItemId, ItemPlacement | undefined>
}): store.ReadStore<ItemList> => {
  let previous: ItemList | undefined

  return store.createDerivedStore({
    get: () => {
      const ids = store.read(input.ids)
      if (previous?.ids === ids) {
        return previous
      }

      const next: ItemList = {
        ids,
        count: ids.length,
        order: collection.createOrderedAccess(ids),
        read: {
          record: (itemId) => store.read(input.record, itemId),
          section: (itemId) => store.read(input.section, itemId),
          placement: (itemId) => store.read(input.placement, itemId)
        }
      }

      previous = next
      return next
    },
    isEqual: Object.is
  })
}

const createListedEntitySource = <TKey extends string | number, TValue>(source: EntitySource<TKey, TValue>): ListedEntitySource<TKey, TValue> => ({
  ...source,
  list: createOrderedKeyedListStore({
    ids: source.ids,
    values: source
  })
})

const createProjectionSelectorSubscription = (
  projection: ProjectionRuntime
): SubscribeSource<ViewState | undefined> => (
  listener
) => projection.subscribe(() => {
  listener(projection.read.active())
})

export const createEngineSource = (input: {
  readDocument: () => DataDoc
  subscribeDocument: (listener: (commit: EngineCommit) => void) => () => void
  projection: ProjectionRuntime
}): EngineSource => {
  const currentDocument = input.readDocument
  const subscribeDocument = (listener: (next: DataDoc) => void) => input.subscribeDocument((commit) => {
    listener(commit.document)
  })
  const projectionSubscribe = createProjectionSelectorSubscription(input.projection)
  const currentActive = () => input.projection.read.active()

  const documentRecords = createSelectedEntitySource({
    current: currentDocument,
    subscribe: subscribeDocument,
    readIds: (document) => document.records.ids,
    readValue: (document, recordId) => document.records.byId[recordId]
  })
  const documentFields = createListedEntitySource(createSelectedEntitySource({
    current: currentDocument,
    subscribe: subscribeDocument,
    readIds: (document) => [TITLE_FIELD_ID, ...document.fields.ids],
    readValue: readDocumentField
  }))
  const schemaFields = createListedEntitySource(createSelectedEntitySource({
    current: currentDocument,
    subscribe: subscribeDocument,
    readIds: (document) => document.fields.ids,
    readValue: (document, fieldId) => document.fields.byId[fieldId]
  }))
  const views = createListedEntitySource(createSelectedEntitySource({
    current: currentDocument,
    subscribe: subscribeDocument,
    readIds: (document) => document.views.ids,
    readValue: (document, viewId) => document.views.byId[viewId]
  }))

  const activeFieldValues = input.projection.stores.fields
  const activeSections = input.projection.stores.sections
  const activeItems = input.projection.stores.items
  const activeSummaries = input.projection.stores.summaries
  const activeItemRecord = store.createKeyedDerivedStore<ItemId, RecordId | undefined>({
    get: (itemId) => store.read(activeItems.byId, itemId)?.recordId
  })
  const activeItemSection = store.createKeyedDerivedStore<ItemId, SectionId | undefined>({
    get: (itemId) => store.read(activeItems.byId, itemId)?.sectionId
  })
  const activeItemList = createItemListStore({
    ids: activeItems.ids,
    record: activeItemRecord,
    section: activeItemSection,
    placement: activeItems.byId
  })
  const activeSectionList = createOrderedKeyedListStore({
    ids: activeSections.ids,
    values: activeSections.byId
  }) as store.ReadStore<SectionList>
  const activeFieldList = createOrderedKeyedListStore({
    ids: activeFieldValues.ids,
    values: activeFieldValues.byId
  }) as store.ReadStore<FieldList>

  return {
    document: {
      meta: createSelectedStore({
        current: currentDocument,
        subscribe: subscribeDocument,
        select: (document) => document.meta,
        isEqual: equal.sameJsonValue
      }),
      records: documentRecords,
      values: createSelectedKeyedStore({
        current: currentDocument,
        subscribe: subscribeDocument,
        select: readDocumentValue,
        isEqual: equal.sameJsonValue
      }),
      fields: documentFields,
      schema: {
        fields: schemaFields
      },
      views
    },
    active: {
      view: createSelectedStore({
        current: currentActive,
        subscribe: projectionSubscribe,
        select: (active) => active?.view
      }),
      viewId: createSelectedStore({
        current: currentActive,
        subscribe: projectionSubscribe,
        select: (active) => active?.view.id
      }),
      viewType: createSelectedStore({
        current: currentActive,
        subscribe: projectionSubscribe,
        select: (active) => active?.view.type
      }),
      query: createSelectedStore({
        current: currentActive,
        subscribe: projectionSubscribe,
        select: (active) => active?.query ?? EMPTY_QUERY
      }),
      table: createSelectedStore({
        current: currentActive,
        subscribe: projectionSubscribe,
        select: (active) => active?.table ?? EMPTY_TABLE
      }),
      gallery: createSelectedStore({
        current: currentActive,
        subscribe: projectionSubscribe,
        select: (active) => active?.gallery ?? EMPTY_GALLERY
      }),
      kanban: createSelectedStore({
        current: currentActive,
        subscribe: projectionSubscribe,
        select: (active) => active?.kanban ?? EMPTY_KANBAN
      }),
      records: {
        matched: createSelectedStore({
          current: currentActive,
          subscribe: projectionSubscribe,
          select: (active) => active?.records.matched ?? EMPTY_RECORD_IDS,
          isEqual: equal.sameOrder
        }),
        ordered: createSelectedStore({
          current: currentActive,
          subscribe: projectionSubscribe,
          select: (active) => active?.records.ordered ?? EMPTY_RECORD_IDS,
          isEqual: equal.sameOrder
        }),
        visible: createSelectedStore({
          current: currentActive,
          subscribe: projectionSubscribe,
          select: (active) => active?.records.visible ?? EMPTY_RECORD_IDS,
          isEqual: equal.sameOrder
        })
      },
      items: {
        ids: activeItems.ids,
        read: {
          record: activeItemRecord,
          section: activeItemSection,
          placement: activeItems.byId
        },
        list: activeItemList
      },
      sections: {
        ids: activeSections.ids,
        list: activeSectionList,
        get: activeSections.byId.get,
        subscribe: activeSections.byId.subscribe,
        ...(activeSections.byId.isEqual
          ? {
              isEqual: activeSections.byId.isEqual
            }
          : {})
      } satisfies SectionSource,
      summaries: activeSummaries.byId,
      fields: {
        ids: activeFieldValues.ids,
        get: activeFieldValues.byId.get,
        subscribe: activeFieldValues.byId.subscribe,
        ...(activeFieldValues.byId.isEqual
          ? {
              isEqual: activeFieldValues.byId.isEqual
            }
          : {}),
        list: activeFieldList
      }
    }
  }
}
