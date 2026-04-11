import type {
  Field,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
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
  ids: readonly AppearanceId[]
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
  count: number
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

export interface FieldList {
  ids: readonly FieldId[]
  all: readonly Field[]
  get: (id: FieldId) => Field | undefined
  has: (id: FieldId) => boolean
  indexOf: (id: FieldId) => number | undefined
  at: (index: number) => FieldId | undefined
  range: (anchor: FieldId, focus: FieldId) => readonly FieldId[]
}
