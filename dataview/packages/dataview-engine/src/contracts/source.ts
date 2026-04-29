import type { CalculationCollection } from '@dataview/core/view'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  ValueRef,
  View,
  ViewId
} from '@dataview/core/types'
import { type collection, store } from '@shared/core'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
} from '@dataview/engine/contracts/view'
import type {
  ItemId,
  ItemList,
  ItemPlacement,
  Section,
  SectionId,
  SectionList
} from '@dataview/engine/contracts/shared'

export interface EntitySource<Key, Value> extends store.KeyedReadStore<Key, Value | undefined> {
  ids: store.ReadStore<readonly Key[]>
}

export interface ListedEntitySource<Key, Value> extends EntitySource<Key, Value> {
  list: store.ReadStore<collection.OrderedKeyedCollection<Key, Value>>
}

export interface SectionSource extends ListedEntitySource<SectionId, Section> {
  list: store.ReadStore<SectionList>
}

export interface ItemSource {
  ids: store.ReadStore<readonly ItemId[]>
  read: {
    record: store.KeyedReadStore<ItemId, RecordId | undefined>
    section: store.KeyedReadStore<ItemId, SectionId | undefined>
    placement: store.KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
  list: store.ReadStore<ItemList>
}

export interface DocumentSource {
  meta: store.ReadStore<DataDoc['meta']>
  records: EntitySource<RecordId, DataRecord>
  values: store.KeyedReadStore<ValueRef, unknown>
  fields: ListedEntitySource<FieldId, Field>
  schema: {
    fields: ListedEntitySource<CustomFieldId, CustomField>
  }
  views: ListedEntitySource<ViewId, View>
}

export interface ActiveSource {
  view: store.ReadStore<View | undefined>
  viewId: store.ReadStore<ViewId | undefined>
  viewType: store.ReadStore<View['type'] | undefined>
  query: store.ReadStore<ActiveViewQuery>
  table: store.ReadStore<ActiveViewTable>
  gallery: store.ReadStore<ActiveViewGallery>
  kanban: store.ReadStore<ActiveViewKanban>
  records: {
    matched: store.ReadStore<readonly RecordId[]>
    ordered: store.ReadStore<readonly RecordId[]>
    visible: store.ReadStore<readonly RecordId[]>
  }
  items: ItemSource
  sections: SectionSource
  summaries: store.KeyedReadStore<SectionId, CalculationCollection | undefined>
  fields: ListedEntitySource<FieldId, Field>
}

export interface EngineSource {
  document: DocumentSource
  active: ActiveSource
}
