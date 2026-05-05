import type {
  Field,
  FieldId,
  RecordId,
  ValueRef
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
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

const VALUE_ID_SEPARATOR = '\u0000'

const valueId = (value: ValueRef): string => `${value.recordId}${VALUE_ID_SEPARATOR}${value.fieldId}`

const createOrderedKeyedListStore = <TId, T>(input: {
  ids: store.ReadStore<readonly TId[]>
  values: store.KeyedReadStore<TId, T | undefined>
}): store.ReadStore<collection.OrderedKeyedCollection<TId, T>> => {
  let previous: collection.OrderedKeyedCollection<TId, T> | undefined
  return store.value(() => {
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

    const all = collection.presentValues(ids, (id) => store.read(input.values, id))
    const next = collection.createOrderedKeyedCollection({
      ids,
      all,
      get: (id) => store.read(input.values, id)
    })
    previous = next
    return next
  }, {
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
  return store.value(() => {
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
  }, {
    isEqual: Object.is
  })
}

const toEntitySource = <TKey extends string | number, TValue>(source: {
  ids: store.ReadStore<readonly TKey[]>
  byId: store.KeyedReadStore<TKey, TValue | undefined>
}): EntitySource<TKey, TValue> => ({
  ids: source.ids,
  get: source.byId.get,
  subscribe: source.byId.subscribe,
  ...(source.byId.isEqual
    ? {
        isEqual: source.byId.isEqual
      }
    : {})
})

const toListedEntitySource = <TKey extends string | number, TValue>(
  source: EntitySource<TKey, TValue>
): ListedEntitySource<TKey, TValue> => ({
  ...source,
  list: createOrderedKeyedListStore({
    ids: source.ids,
    values: source
  })
})

export const createEngineSource = (input: {
  projection: ReturnType<typeof createDataviewProjection>
}): EngineSource => {
  const documentRecords = toEntitySource(input.projection.stores.document.records)
  const documentFields = toListedEntitySource(toEntitySource(input.projection.stores.document.fields))
  const schemaFields = toListedEntitySource(toEntitySource(input.projection.stores.document.schema.fields))
  const views = toListedEntitySource(toEntitySource(input.projection.stores.document.views))
  const activeFields = toEntitySource(input.projection.stores.active.fields)
  const activeSections = toEntitySource(input.projection.stores.active.sections)
  const activeItems = toEntitySource(input.projection.stores.active.items)
  const activeItemRecord = store.keyed<ItemId, RecordId | undefined>(
    (itemId) => store.read(activeItems, itemId)?.recordId
  )
  const activeItemSection = store.keyed<ItemId, SectionId | undefined>(
    (itemId) => store.read(activeItems, itemId)?.sectionId
  )
  const activeItemList = createItemListStore({
    ids: activeItems.ids,
    record: activeItemRecord,
    section: activeItemSection,
    placement: activeItems
  })
  const activeSectionList = createOrderedKeyedListStore({
    ids: activeSections.ids,
    values: activeSections
  }) as store.ReadStore<SectionList>
  const activeFieldList = createOrderedKeyedListStore({
    ids: activeFields.ids,
    values: activeFields
  }) as store.ReadStore<FieldList>
  const documentValues = store.keyed<ValueRef, unknown>((ref) => {
    const record = store.read(documentRecords, ref.recordId)
    if (!record) {
      return undefined
    }

    return ref.fieldId === TITLE_FIELD_ID
      ? record.title
      : record.values[ref.fieldId]
  }, {
    isEqual: equal.sameJsonValue,
    keyOf: valueId
  })

  return {
    document: {
      meta: input.projection.stores.document.meta as EngineSource['document']['meta'],
      records: documentRecords,
      values: documentValues,
      fields: documentFields,
      schema: {
        fields: schemaFields
      },
      views
    },
    active: {
      view: input.projection.stores.active.view,
      viewId: input.projection.stores.active.viewId,
      viewType: input.projection.stores.active.viewType,
      query: input.projection.stores.active.query,
      table: input.projection.stores.active.table,
      gallery: input.projection.stores.active.gallery,
      kanban: input.projection.stores.active.kanban,
      records: {
        matched: input.projection.stores.active.records.matched,
        ordered: input.projection.stores.active.records.ordered,
        visible: input.projection.stores.active.records.visible
      },
      items: {
        ids: activeItems.ids,
        read: {
          record: activeItemRecord,
          section: activeItemSection,
          placement: activeItems
        },
        list: activeItemList
      },
      sections: {
        ...activeSections,
        list: activeSectionList
      } satisfies SectionSource,
      summaries: input.projection.stores.active.summaries.byId,
      fields: {
        ...activeFields,
        list: activeFieldList
      }
    }
  }
}
