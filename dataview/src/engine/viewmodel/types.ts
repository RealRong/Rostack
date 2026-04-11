import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  SectionKey
} from '../project/model'

export interface Schema {
  fields: ReadonlyMap<FieldId, Field>
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
