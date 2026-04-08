import type {
  Field,
  FieldId,
  View,
  RecordId
} from '@dataview/core/contracts'
import type { CalculationCollection } from '@dataview/core/calculation'
import type { Bucket } from '@dataview/core/field'

export type AppearanceId = string
export type SectionKey = string

export interface SectionBucket extends Pick<Bucket, 'key' | 'title' | 'value' | 'clearValue' | 'empty' | 'color'> {}

export interface Appearance {
  id: AppearanceId
  recordId: RecordId
  section: SectionKey
}

export interface Section {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  ids: readonly AppearanceId[]
  collapsed: boolean
}

export interface AppearanceList {
  byId: ReadonlyMap<AppearanceId, Appearance>
  ids: readonly AppearanceId[]
  get: (id: AppearanceId) => Appearance | undefined
  has: (id: AppearanceId) => boolean
  indexOf: (id: AppearanceId) => number | undefined
  at: (index: number) => AppearanceId | undefined
  prev: (id: AppearanceId) => AppearanceId | undefined
  next: (id: AppearanceId) => AppearanceId | undefined
  range: (anchor: AppearanceId, focus: AppearanceId) => readonly AppearanceId[]
  sectionOf: (id: AppearanceId) => SectionKey | undefined
  idsIn: (section: SectionKey) => readonly AppearanceId[]
}

export interface Schema {
  fields: ReadonlyMap<FieldId, Field>
}

export interface FieldList {
  ids: readonly FieldId[]
  all: readonly Field[]
  get: (id: FieldId) => Field | undefined
  has: (id: FieldId) => boolean
  indexOf: (id: FieldId) => number | undefined
  at: (index: number) => FieldId | undefined
  range: (anchor: FieldId, focus: FieldId) => readonly FieldId[]
}

export interface Placement {
  section: SectionKey
  before?: AppearanceId
}

export interface Plan {
  ids: readonly AppearanceId[]
  target: Placement
  changed: boolean
}

export interface ViewProjection {
  view: View
  schema: Schema
  appearances: AppearanceList
  sections: readonly Section[]
  fields: FieldList
  calculationsBySection: ReadonlyMap<SectionKey, CalculationCollection>
}

export type {
  CellRef,
  RecordFieldRef,
  ViewFieldRef
} from './field'
