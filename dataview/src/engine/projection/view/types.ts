import type {
  GroupProperty,
  GroupView,
  PropertyId,
  RecordId
} from '@dataview/core/contracts'

export type AppearanceId = string
export type SectionKey = string

export interface Appearance {
  id: AppearanceId
  recordId: RecordId
  section: SectionKey
}

export interface Section {
  key: SectionKey
  title: string
  color?: string
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
  properties: ReadonlyMap<PropertyId, GroupProperty>
}

export interface PropertyList {
  ids: readonly PropertyId[]
  all: readonly GroupProperty[]
  get: (id: PropertyId) => GroupProperty | undefined
  has: (id: PropertyId) => boolean
  indexOf: (id: PropertyId) => number | undefined
  at: (index: number) => PropertyId | undefined
  range: (anchor: PropertyId, focus: PropertyId) => readonly PropertyId[]
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
  view: GroupView
  schema: Schema
  appearances: AppearanceList
  sections: readonly Section[]
  properties: PropertyList
}

export type {
  FieldId,
  RecordFieldRef,
  ViewFieldRef
} from './field'
