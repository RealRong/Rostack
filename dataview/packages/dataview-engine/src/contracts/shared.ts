import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  ViewGroupBucketId,
  ViewId
} from '@dataview/core/contracts'
import type {
  collection
} from '@shared/core'
import type {
  Token
} from '@shared/i18n'

export type ItemId = number
export type SectionId = string

export interface SectionBucket {
  id: ViewGroupBucketId
  label: Token
  value: unknown
  clearValue?: unknown
  empty?: boolean
  color?: string
}

export interface ItemPlacement {
  recordId: RecordId
  sectionId: SectionId
}

export interface ItemRead {
  record: (itemId: ItemId) => RecordId | undefined
  section: (itemId: ItemId) => SectionId | undefined
  placement: (itemId: ItemId) => ItemPlacement | undefined
}

export interface Section {
  id: SectionId
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  recordIds: readonly RecordId[]
  itemIds: readonly ItemId[]
}

export interface SectionList extends collection.OrderedKeyedCollection<SectionId, Section> {}

export interface ItemList {
  ids: readonly ItemId[]
  count: number
  order: collection.OrderedAccess<ItemId>
  read: ItemRead
}

export interface FieldList extends collection.OrderedKeyedCollection<FieldId, Field> {
  custom: readonly CustomField[]
}

export interface CellRef {
  itemId: ItemId
  fieldId: FieldId
}

export interface ViewFieldRef extends CellRef {
  viewId: ViewId
  recordId: RecordId
}

export interface MoveTarget {
  section: SectionId
  before?: ItemId
}

export interface ViewRecords {
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}

export type ViewSummaries = ReadonlyMap<SectionId, CalculationCollection>
