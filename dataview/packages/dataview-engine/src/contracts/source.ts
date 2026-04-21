import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CalculationMetric,
  CardLayout,
  CardSize,
  CustomField,
  DataRecord,
  Field,
  FieldId,
  KanbanCardsPerColumn,
  SortDirection,
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
  TableLayoutState,
  ViewFilterProjection,
  ViewGroupProjection,
  ViewSearchProjection,
  ViewSortProjection
} from '@dataview/engine/contracts/view'

export interface EntitySource<K, T> extends store.KeyedReadStore<K, T | undefined> {
  ids: store.ReadStore<readonly K[]>
}

export interface SectionSource extends store.KeyedReadStore<SectionKey, Section | undefined> {
  keys: store.ReadStore<readonly SectionKey[]>
  summary: store.KeyedReadStore<SectionKey, CalculationCollection | undefined>
}

export interface ActiveQuerySource {
  search: store.ReadStore<ViewSearchProjection>
  filters: store.ReadStore<ViewFilterProjection>
  sort: store.ReadStore<ViewSortProjection>
  group: store.ReadStore<ViewGroupProjection>
  grouped: store.ReadStore<boolean>
  groupFieldId: store.ReadStore<FieldId | ''>
  filterFieldIds: store.ReadStore<readonly FieldId[]>
  sortFieldIds: store.ReadStore<readonly FieldId[]>
  sortDir: store.KeyedReadStore<FieldId, SortDirection | undefined>
}

export interface ActiveTableSource {
  wrap: store.ReadStore<boolean>
  showVerticalLines: store.ReadStore<boolean>
  calc: store.KeyedReadStore<FieldId, CalculationMetric | undefined>
  layout: store.ReadStore<TableLayoutState | null>
}

export interface ActiveGallerySource {
  wrap: store.ReadStore<boolean>
  size: store.ReadStore<CardSize>
  layout: store.ReadStore<CardLayout>
  canReorder: store.ReadStore<boolean>
  groupUsesOptionColors: store.ReadStore<boolean>
}

export interface ActiveKanbanSource {
  wrap: store.ReadStore<boolean>
  size: store.ReadStore<CardSize>
  layout: store.ReadStore<CardLayout>
  canReorder: store.ReadStore<boolean>
  groupUsesOptionColors: store.ReadStore<boolean>
  fillColumnColor: store.ReadStore<boolean>
  cardsPerColumn: store.ReadStore<KanbanCardsPerColumn>
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
  items: EntitySource<ItemId, ViewItem>
  sections: SectionSource
  fields: {
    all: EntitySource<FieldId, Field>
    custom: EntitySource<FieldId, CustomField>
  }
  query: ActiveQuerySource
  table: ActiveTableSource
  gallery: ActiveGallerySource
  kanban: ActiveKanbanSource
}

export interface EngineSource {
  doc: DocumentSource
  active: ActiveSource
}
