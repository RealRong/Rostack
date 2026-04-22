import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  collection
} from '@shared/core'
import type {
  Token
} from '@shared/i18n'

export type ItemId = number
export type SectionKey = string

export interface SectionBucket {
  key: string
  label: Token
  value: unknown
  clearValue?: unknown
  empty?: boolean
  color?: string
}

export interface ItemPlacement {
  recordId: RecordId
  sectionKey: SectionKey
}

export interface ItemRead {
  record: (itemId: ItemId) => RecordId | undefined
  section: (itemId: ItemId) => SectionKey | undefined
  placement: (itemId: ItemId) => ItemPlacement | undefined
}

export interface ItemIdPool {
  allocate: {
    placement: (sectionKey: SectionKey, recordId: RecordId) => ItemId
  }
  read: {
    placement: (itemId: ItemId) => ItemPlacement | undefined
  }
  gc: {
    clear: () => void
  }
}

export interface SectionData {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  recordIds: readonly RecordId[]
  itemIds: readonly ItemId[]
}

export type Section = SectionData

export interface SectionList extends collection.OrderedKeyedCollection<SectionKey, Section> {}

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
  section: SectionKey
  before?: ItemId
}

export interface ViewRecords {
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}

export type ViewSummaries = ReadonlyMap<SectionKey, CalculationCollection>
