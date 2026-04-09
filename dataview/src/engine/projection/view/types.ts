import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  SectionKey
} from '../../project/types'
export type {
  Appearance,
  AppearanceId,
  AppearanceList,
  FieldList,
  Schema,
  Section,
  SectionBucket,
  SectionKey
} from '../../project/types'

export interface Placement {
  section: SectionKey
  before?: AppearanceId
}

export interface Plan {
  ids: readonly AppearanceId[]
  target: Placement
  changed: boolean
}

export type {
  CellRef,
  RecordFieldRef,
  ViewFieldRef
} from './field'
