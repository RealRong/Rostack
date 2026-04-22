import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
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
  EngineCore,
  FieldList,
  ItemId,
  ItemList,
  ItemPlacement,
  Section,
  SectionKey,
  SectionList
} from '@dataview/engine'

export interface EntitySource<Key, Value> extends store.KeyedReadStore<Key, Value | undefined> {
  ids: store.ReadStore<readonly Key[]>
}

export interface ListedEntitySource<Key, Value> extends EntitySource<Key, Value> {
  list: store.ReadStore<readonly Value[]>
}

export interface SectionSource extends store.KeyedReadStore<SectionKey, Section | undefined> {
  ids: store.ReadStore<readonly SectionKey[]>
  list: store.ReadStore<SectionList>
}

export interface ItemSource {
  ids: store.ReadStore<readonly ItemId[]>
  read: {
    recordId: store.KeyedReadStore<ItemId, RecordId | undefined>
    sectionKey: store.KeyedReadStore<ItemId, SectionKey | undefined>
    placement: store.KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
  list: store.ReadStore<ItemList>
}

export interface DocumentSource {
  records: EntitySource<RecordId, DataRecord>
  fields: ListedEntitySource<FieldId, CustomField>
  views: ListedEntitySource<ViewId, View>
}

export interface ActiveSource {
  view: {
    id: store.ReadStore<ViewId | undefined>
    type: store.ReadStore<View['type'] | undefined>
    current: store.ReadStore<View | undefined>
  }
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
  summaries: store.KeyedReadStore<SectionKey, CalculationCollection | undefined>
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
    list: store.ReadStore<FieldList>
    customList: store.ReadStore<readonly CustomField[]>
  }
}

export interface EngineSource {
  doc: DocumentSource
  active: ActiveSource
}

export interface EngineSourceRuntime {
  source: EngineSource
  dispose: () => void
}

export interface CreateEngineSourceInput {
  core: EngineCore
}
