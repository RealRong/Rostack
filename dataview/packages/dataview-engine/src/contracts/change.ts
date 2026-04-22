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
  ActiveViewGallery,
  ActiveViewKanban,
  ActiveViewQuery,
  ActiveViewTable
} from '@dataview/engine/contracts/view'
import type {
  ViewRecords,
  ItemId,
  ItemPlacement,
  Section,
  SectionKey
} from '@dataview/engine/contracts/shared'

export interface EntityChange<TKey, TValue> {
  ids?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue])[]
  remove?: readonly TKey[]
}

export interface DocumentChange {
  records?: EntityChange<RecordId, DataRecord>
  fields?: EntityChange<FieldId, CustomField>
  views?: EntityChange<ViewId, View>
}

export interface ActiveViewChange {
  ready?: boolean
  id?: ViewId
  type?: View['type']
  current?: View
  query?: ActiveViewQuery
  table?: ActiveViewTable
  gallery?: ActiveViewGallery
  kanban?: ActiveViewKanban
}

export interface ActiveRecordsChange {
  matched?: ViewRecords['matched']
  ordered?: ViewRecords['ordered']
  visible?: ViewRecords['visible']
}

export interface ItemValue {
  record: RecordId
  section: SectionKey
  placement: ItemPlacement
}

export interface ItemChange extends EntityChange<ItemId, ItemValue> {}

export interface SectionChange {
  keys?: readonly SectionKey[]
  set?: readonly (readonly [SectionKey, Section])[]
  remove?: readonly SectionKey[]
}

export interface SummaryChange {
  set?: readonly (readonly [SectionKey, CalculationCollection])[]
  remove?: readonly SectionKey[]
}

export interface ActiveChange {
  reset?: true
  view?: ActiveViewChange
  records?: ActiveRecordsChange
  items?: ItemChange
  sections?: SectionChange
  summaries?: SummaryChange
  fields?: {
    all?: EntityChange<FieldId, Field>
    custom?: EntityChange<FieldId, CustomField>
  }
}

export interface EngineChange {
  doc?: DocumentChange
  active?: ActiveChange
}
