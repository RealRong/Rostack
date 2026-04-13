import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'

export type ItemId = string
export type SectionKey = string

export interface SectionBucket {
  key: string
  title: string
  value: unknown
  clearValue?: unknown
  empty?: boolean
  color?: string
}

export interface ViewItem {
  id: ItemId
  recordId: RecordId
  sectionKey: SectionKey
}

export interface SectionData {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  itemIds: readonly ItemId[]
  recordIds: readonly RecordId[]
}

export interface Section extends SectionData {}

export interface SectionList {
  ids: readonly SectionKey[]
  all: readonly Section[]
  get: (key: SectionKey) => Section | undefined
  has: (key: SectionKey) => boolean
  indexOf: (key: SectionKey) => number | undefined
  at: (index: number) => SectionKey | undefined
}

export interface ItemList {
  ids: readonly ItemId[]
  count: number
  get: (id: ItemId) => ViewItem | undefined
  has: (id: ItemId) => boolean
  indexOf: (id: ItemId) => number | undefined
  at: (index: number) => ItemId | undefined
  prev: (id: ItemId) => ItemId | undefined
  next: (id: ItemId) => ItemId | undefined
  range: (anchor: ItemId, focus: ItemId) => readonly ItemId[]
}

export interface FieldList {
  ids: readonly FieldId[]
  all: readonly Field[]
  custom: readonly CustomField[]
  get: (id: FieldId) => Field | undefined
  has: (id: FieldId) => boolean
  indexOf: (id: FieldId) => number | undefined
  at: (index: number) => FieldId | undefined
  range: (anchor: FieldId, focus: FieldId) => readonly FieldId[]
}

export interface CellRef {
  itemId: ItemId
  fieldId: FieldId
}

export interface ViewFieldRef extends CellRef {
  viewId: ViewId
  recordId: RecordId
}

export interface Placement {
  section: SectionKey
  before?: ItemId
}

export interface ViewRecords {
  matched: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}

export type ViewSummaries = ReadonlyMap<SectionKey, CalculationCollection>
