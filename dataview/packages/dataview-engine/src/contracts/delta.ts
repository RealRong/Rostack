import type {
  FieldId,
  RecordId,
  ValueRef,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionId
} from '@dataview/engine/contracts/shared'

export interface CollectionDelta<Key> {
  list?: true
  update?: readonly Key[]
  remove?: readonly Key[]
}

export interface KeyDelta<Key> {
  update?: readonly Key[]
  remove?: readonly Key[]
}

export interface ListedDelta<Key> {
  ids?: true
  update?: readonly Key[]
  remove?: readonly Key[]
}

export interface DocDelta {
  reset?: true
  meta?: true
  records?: ListedDelta<RecordId>
  values?: KeyDelta<ValueRef>
  fields?: ListedDelta<FieldId>
  views?: ListedDelta<ViewId>
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
  sections?: CollectionDelta<SectionId>
  items?: CollectionDelta<ItemId>
  summaries?: CollectionDelta<SectionId>
}

export interface EngineDelta {
  doc?: DocDelta
  active?: ActiveDelta
}
