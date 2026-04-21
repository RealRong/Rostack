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

export interface EntityPatch<TKey, TValue> {
  ids?: readonly TKey[]
  set?: ReadonlyMap<TKey, TValue | undefined>
  remove?: readonly TKey[]
}

export interface DocumentPatch {
  records?: EntityPatch<RecordId, DataRecord>
  fields?: EntityPatch<FieldId, CustomField>
  views?: EntityPatch<ViewId, View>
}

export interface ActivePatch {
  view?: {
    ready?: boolean
    id?: ViewId
    type?: View['type']
    value?: View | undefined
  }
  meta?: {
    query?: ActiveViewQuery
    table?: ActiveViewTable
    gallery?: ActiveViewGallery
    kanban?: ActiveViewKanban
  }
  items?: EntityPatch<ItemId, ViewItem>
  sections?: {
    data?: EntityPatch<SectionKey, Section>
    summary?: EntityPatch<SectionKey, CalculationCollection | undefined>
  }
  fields?: {
    all?: EntityPatch<FieldId, Field>
    custom?: EntityPatch<FieldId, CustomField>
  }
}

export interface EnginePatch {
  document?: {
    records?: EntityPatch<RecordId, DataRecord>
    fields?: EntityPatch<FieldId, CustomField>
    views?: EntityPatch<ViewId, View>
  }
  active?: ActivePatch
}
