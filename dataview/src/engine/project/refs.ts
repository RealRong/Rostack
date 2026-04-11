import type {
  Field,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  AppearanceList,
  AppearanceId,
} from './readModels'
import {
  sameJsonValue,
  sameMap
} from '@shared/core'

export type FieldLookup = ReadonlyMap<FieldId, Field>

export interface CellRef {
  appearanceId: AppearanceId
  fieldId: FieldId
}

export interface ViewFieldRef extends CellRef {
  viewId: ViewId
  recordId: RecordId
}

export interface RecordFieldRef {
  recordId: RecordId
  fieldId: FieldId
}

export interface Placement {
  section: import('./readModels').SectionKey
  before?: AppearanceId
}

export const sameCellRef = (
  left: CellRef,
  right: CellRef
) => (
  left.appearanceId === right.appearanceId
  && left.fieldId === right.fieldId
)

export const sameViewField = (
  left: ViewFieldRef,
  right: ViewFieldRef
) => (
  left.viewId === right.viewId
  && left.recordId === right.recordId
  && sameCellRef(left, right)
)

export const fieldId = (
  field: Pick<ViewFieldRef, 'appearanceId' | 'fieldId'>
): CellRef => ({
  appearanceId: field.appearanceId,
  fieldId: field.fieldId
})

export const fieldOf = (input: {
  viewId: ViewId
  field: CellRef
  appearances?: Pick<AppearanceList, 'get'>
}): ViewFieldRef | null => {
  const recordId = input.appearances?.get(input.field.appearanceId)?.recordId

  return recordId
    ? {
        viewId: input.viewId,
        appearanceId: input.field.appearanceId,
        recordId,
        fieldId: input.field.fieldId
      }
    : null
}

export const replaceField = (
  field: ViewFieldRef,
  fieldId: FieldId
): ViewFieldRef => ({
  ...field,
  fieldId
})

export const toRecordField = (
  field: CellRef | ViewFieldRef,
  appearances?: Pick<AppearanceList, 'get'>
): RecordFieldRef | null => {
  const recordId = 'recordId' in field
    ? field.recordId
    : appearances?.get(field.appearanceId)?.recordId

  return recordId
    ? {
        recordId,
        fieldId: field.fieldId
      }
    : null
}

const equalField = (
  left: Field,
  right: Field
) => sameJsonValue(left, right)

export const sameFieldLookup = (
  left: FieldLookup,
  right: FieldLookup
) => sameMap(left, right, equalField)
