import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  SectionKey,
} from './readModels'

export interface CellRef {
  appearanceId: AppearanceId
  fieldId: FieldId
}

export interface ViewFieldRef extends CellRef {
  viewId: ViewId
  recordId: RecordId
}

export interface Placement {
  sectionKey: SectionKey
  before?: AppearanceId
}

export const sameCellRef = (
  left: CellRef,
  right: CellRef
) => (
  left.appearanceId === right.appearanceId
  && left.fieldId === right.fieldId
)
