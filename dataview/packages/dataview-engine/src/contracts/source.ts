import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  DataRecord,
  Field,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { store } from '@shared/core'
import type {
  ItemId,
  Section,
  SectionKey,
  ViewItem
} from '@dataview/engine/contracts/shared'
import type {
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable
} from '@dataview/engine/contracts/view'

export interface EntitySource<K, T> extends store.KeyedReadStore<K, T | undefined> {
  ids: store.ReadStore<readonly K[]>
}

export interface SectionSource extends store.KeyedReadStore<SectionKey, Section | undefined> {
  keys: store.ReadStore<readonly SectionKey[]>
  summary: store.KeyedReadStore<SectionKey, CalculationCollection | undefined>
}

export interface DocumentSource {
  records: EntitySource<string, DataRecord>
  fields: EntitySource<FieldId, CustomField>
  views: EntitySource<ViewId, View>
}

export interface ActiveSource {
  view: {
    ready: store.ReadStore<boolean>
    id: store.ReadStore<ViewId | undefined>
    type: store.ReadStore<View['type'] | undefined>
    current: store.ReadStore<View | undefined>
  }
  meta: {
    query: store.ReadStore<ActiveViewQuery>
    table: store.ReadStore<ActiveViewTable>
    gallery: store.ReadStore<ActiveViewGallery>
    kanban: store.ReadStore<ActiveViewKanban>
  }
  items: EntitySource<ItemId, ViewItem>
  sections: SectionSource
  fields: {
      all: EntitySource<FieldId, Field>
      custom: EntitySource<FieldId, CustomField>
  }
}

export interface EngineSource {
  doc: DocumentSource
  active: ActiveSource
}
