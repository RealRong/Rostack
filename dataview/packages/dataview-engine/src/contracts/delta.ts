import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionKey
} from '@dataview/engine/contracts/shared'

export interface CollectionDelta<Key> {
  list?: true
  update?: readonly Key[]
  remove?: readonly Key[]
}

export interface DocDelta {
  records?: CollectionDelta<RecordId>
  fields?: CollectionDelta<FieldId>
  views?: CollectionDelta<ViewId>
}

export interface ActiveDelta {
  reset?: true
  view?: true
  query?: true
  table?: true
  gallery?: true
  kanban?: true
  records?: {
    matched?: true
    ordered?: true
    visible?: true
  }
  fields?: {
    all?: CollectionDelta<FieldId>
    custom?: CollectionDelta<FieldId>
  }
  sections?: CollectionDelta<SectionKey>
  items?: CollectionDelta<ItemId>
  summaries?: CollectionDelta<SectionKey>
}

export interface EngineDelta {
  doc?: DocDelta
  active?: ActiveDelta
}
