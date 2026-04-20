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
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'
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

export interface EntitySource<K, T> extends KeyedReadStore<K, T | undefined> {
  ids: ReadStore<readonly K[]>
}

export interface SectionSource extends KeyedReadStore<SectionKey, Section | undefined> {
  keys: ReadStore<readonly SectionKey[]>
  summary: KeyedReadStore<SectionKey, CalculationCollection | undefined>
}

export interface ActiveQuerySource {
  search: ReadStore<ViewSearchProjection>
  filters: ReadStore<ViewFilterProjection>
  sort: ReadStore<ViewSortProjection>
  group: ReadStore<ViewGroupProjection>
  grouped: ReadStore<boolean>
  groupFieldId: ReadStore<FieldId | ''>
  filterFieldIds: ReadStore<readonly FieldId[]>
  sortFieldIds: ReadStore<readonly FieldId[]>
  sortDir: KeyedReadStore<FieldId, SortDirection | undefined>
}

export interface ActiveTableSource {
  wrap: ReadStore<boolean>
  showVerticalLines: ReadStore<boolean>
  calc: KeyedReadStore<FieldId, CalculationMetric | undefined>
  layout: ReadStore<TableLayoutState | null>
}

export interface ActiveGallerySource {
  wrap: ReadStore<boolean>
  size: ReadStore<CardSize>
  layout: ReadStore<CardLayout>
  canReorder: ReadStore<boolean>
  groupUsesOptionColors: ReadStore<boolean>
}

export interface ActiveKanbanSource {
  wrap: ReadStore<boolean>
  size: ReadStore<CardSize>
  layout: ReadStore<CardLayout>
  canReorder: ReadStore<boolean>
  groupUsesOptionColors: ReadStore<boolean>
  fillColumnColor: ReadStore<boolean>
  cardsPerColumn: ReadStore<KanbanCardsPerColumn>
}

export interface DocumentSource {
  records: EntitySource<string, DataRecord>
  fields: EntitySource<FieldId, CustomField>
  views: EntitySource<ViewId, View>
}

export interface ActiveSource {
  view: {
    ready: ReadStore<boolean>
    id: ReadStore<ViewId | undefined>
    type: ReadStore<View['type'] | undefined>
    current: ReadStore<View | undefined>
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
