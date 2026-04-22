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
  EngineCore,
} from '@dataview/engine/contracts/core'
import type {
  ItemId,
  ItemPlacement,
  Section,
  SectionKey
} from '@dataview/engine/contracts/shared'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable
} from '@dataview/engine/contracts/view'

export interface EntitySource<Key, Value> extends store.KeyedReadStore<Key, Value | undefined> {
  ids: store.ReadStore<readonly Key[]>
}

export interface SectionSource extends store.KeyedReadStore<SectionKey, Section | undefined> {
  ids: store.ReadStore<readonly SectionKey[]>
}

export interface ItemSource {
  ids: store.ReadStore<readonly ItemId[]>
  read: {
    recordId: store.KeyedReadStore<ItemId, RecordId | undefined>
    sectionKey: store.KeyedReadStore<ItemId, SectionKey | undefined>
    placement: store.KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
}

export interface DocumentSource {
  records: EntitySource<RecordId, DataRecord>
  fields: EntitySource<FieldId, CustomField>
  views: EntitySource<ViewId, View>
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
