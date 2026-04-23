import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { store } from '@shared/core'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable,
  Engine,
  FieldList,
  ItemId,
  ItemList,
  ItemPlacement,
  Section,
  SectionId,
  SectionList
} from '@dataview/engine'
import type { RecordValueRef } from '@dataview/runtime/refs'

export interface EntitySource<Key, Value> extends store.KeyedReadStore<Key, Value | undefined> {
  ids: store.ReadStore<readonly Key[]>
}

export interface ListedEntitySource<Key, Value> extends EntitySource<Key, Value> {
  list: store.ReadStore<readonly Value[]>
}

export interface SectionSource extends store.KeyedReadStore<SectionId, Section | undefined> {
  ids: store.ReadStore<readonly SectionId[]>
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
  values: store.KeyedReadStore<RecordValueRef, unknown>
  fields: ListedEntitySource<FieldId, CustomField>
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
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
    list: store.ReadStore<FieldList>
    customList: store.ReadStore<readonly CustomField[]>
  }
}

export interface EngineSource {
  document: DocumentSource
  active: ActiveSource
}

export interface EngineSourceRuntime {
  source: EngineSource
  dispose: () => void
}

export interface CreateEngineSourceInput {
  engine: Pick<Engine, 'result' | 'subscribe'>
}
