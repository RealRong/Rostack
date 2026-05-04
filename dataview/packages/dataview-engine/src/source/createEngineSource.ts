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
  createActiveSourceProjection,
  createDocumentSourceProjection
} from '@dataview/engine/source/projections'

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
  documentProjection: ReturnType<typeof createDocumentSourceProjection>
  activeProjection: ReturnType<typeof createActiveSourceProjection>
}): EngineSource => {
  const documentRecords = toEntitySource(input.documentProjection.stores.records)
  const documentFields = toListedEntitySource(toEntitySource(input.documentProjection.stores.fields))
  const schemaFields = toListedEntitySource(toEntitySource(input.documentProjection.stores.schema.fields))
  const views = toListedEntitySource(toEntitySource(input.documentProjection.stores.views))
  const activeFields = toEntitySource(input.activeProjection.stores.fields)
  const activeSections = toEntitySource(input.activeProjection.stores.sections)
  const activeItems = toEntitySource(input.activeProjection.stores.items)
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
      meta: input.documentProjection.stores.meta,
      records: documentRecords,
      values: documentValues,
      fields: documentFields,
      schema: {
        fields: schemaFields
      },
      views
    },
    active: {
      view: input.activeProjection.stores.view,
      viewId: input.activeProjection.stores.viewId,
      viewType: input.activeProjection.stores.viewType,
      query: input.activeProjection.stores.query,
      table: input.activeProjection.stores.table,
      gallery: input.activeProjection.stores.gallery,
      kanban: input.activeProjection.stores.kanban,
      records: {
        matched: input.activeProjection.stores.records.matched,
        ordered: input.activeProjection.stores.records.ordered,
        visible: input.activeProjection.stores.records.visible
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
      summaries: input.activeProjection.stores.summaries.byId,
      fields: {
        ...activeFields,
        list: activeFieldList
      }
    }
  }
}
