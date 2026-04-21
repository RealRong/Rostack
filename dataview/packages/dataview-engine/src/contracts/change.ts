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

export interface EntityDelta<TKey, TValue> {
  ids?: readonly TKey[]
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

export interface SourceDelta {
  document?: {
    records?: EntityDelta<RecordId, DataRecord>
    fields?: EntityDelta<FieldId, CustomField>
    views?: EntityDelta<ViewId, View>
  }
  active?: {
    view?: {
      ready?: boolean
      id?: ViewId
      type?: View['type']
      value?: View | undefined
    }
    query?: ActiveViewQuery
    table?: ActiveViewTable
    gallery?: ActiveViewGallery
    kanban?: ActiveViewKanban
    items?: EntityDelta<ItemId, ViewItem>
    sections?: {
      records?: EntityDelta<SectionKey, Section>
      summary?: EntityDelta<SectionKey, CalculationCollection | undefined>
    }
    fields?: {
      all?: EntityDelta<FieldId, Field>
      custom?: EntityDelta<FieldId, CustomField>
    }
  }
}
