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
  RecordId,
  SortDirection,
  View,
  ViewId
} from '@dataview/core/contracts'
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

export interface DocumentChange {
  records: {
    changed: readonly RecordId[]
    removed: readonly RecordId[]
    idsChanged: boolean
  }
  fields: {
    changed: readonly FieldId[]
    removed: readonly FieldId[]
    idsChanged: boolean
  }
  views: {
    changed: readonly ViewId[]
    removed: readonly ViewId[]
    idsChanged: boolean
  }
  activeViewChanged: boolean
}

export interface EntityDelta<TKey, TValue> {
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

export interface ViewPublishDelta {
  rebuild: boolean
  view?: {
    ready: boolean
    id?: ViewId
    type?: View['type']
    value?: View | undefined
  }
  query?: {
    search?: ViewSearchProjection
    filters?: ViewFilterProjection
    sort?: ViewSortProjection
    group?: ViewGroupProjection
    grouped?: boolean
    groupFieldId?: FieldId | ''
    filterFieldIds?: readonly FieldId[]
    sortFieldIds?: readonly FieldId[]
    sortDir?: ReadonlyMap<FieldId, SortDirection | undefined>
  }
  items?: {
    ids?: readonly ItemId[]
    values?: EntityDelta<ItemId, ViewItem>
  }
  sections?: {
    keys?: readonly SectionKey[]
    values?: EntityDelta<SectionKey, Section>
    summary?: EntityDelta<SectionKey, CalculationCollection | undefined>
  }
  fields?: {
    all?: readonly Field[]
    custom?: readonly CustomField[]
  }
  table?: {
    wrap?: boolean
    showVerticalLines?: boolean
    calc?: ReadonlyMap<FieldId, CalculationMetric | undefined>
  }
  gallery?: {
    wrap?: boolean
    size?: CardSize
    layout?: CardLayout
    canReorder?: boolean
    groupUsesOptionColors?: boolean
  }
  kanban?: {
    wrap?: boolean
    size?: CardSize
    layout?: CardLayout
    canReorder?: boolean
    groupUsesOptionColors?: boolean
    fillColumnColor?: boolean
    cardsPerColumn?: KanbanCardsPerColumn
  }
}

export interface SourceDelta {
  document?: {
    records?: {
      ids?: readonly RecordId[]
      values?: EntityDelta<RecordId, DataRecord>
    }
    fields?: {
      ids?: readonly FieldId[]
      values?: EntityDelta<FieldId, CustomField>
    }
    views?: {
      ids?: readonly ViewId[]
      values?: EntityDelta<ViewId, View>
    }
  }
  active?: {
    view?: {
      ready?: boolean
      id?: ViewId
      type?: View['type']
      value?: View | undefined
    }
    items?: {
      ids?: readonly ItemId[]
      values?: EntityDelta<ItemId, ViewItem>
    }
    sections?: {
      keys?: readonly SectionKey[]
      values?: EntityDelta<SectionKey, Section>
      summary?: EntityDelta<SectionKey, CalculationCollection | undefined>
    }
    fields?: {
      all?: {
        ids?: readonly FieldId[]
        values?: EntityDelta<FieldId, Field>
      }
      custom?: {
        ids?: readonly FieldId[]
        values?: EntityDelta<FieldId, CustomField>
      }
    }
    query?: {
      search?: ViewSearchProjection
      filters?: ViewFilterProjection
      sort?: ViewSortProjection
      group?: ViewGroupProjection
      grouped?: boolean
      groupFieldId?: FieldId | ''
      filterFieldIds?: readonly FieldId[]
      sortFieldIds?: readonly FieldId[]
      sortDir?: EntityDelta<FieldId, SortDirection>
    }
    table?: {
      wrap?: boolean
      showVerticalLines?: boolean
      calc?: EntityDelta<FieldId, CalculationMetric>
      layout?: TableLayoutState | null
    }
    gallery?: {
      wrap?: boolean
      size?: CardSize
      layout?: CardLayout
      canReorder?: boolean
      groupUsesOptionColors?: boolean
    }
    kanban?: {
      wrap?: boolean
      size?: CardSize
      layout?: CardLayout
      canReorder?: boolean
      groupUsesOptionColors?: boolean
      fillColumnColor?: boolean
      cardsPerColumn?: KanbanCardsPerColumn
    }
  }
}
