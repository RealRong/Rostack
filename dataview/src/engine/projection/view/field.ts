import type {
  PropertyId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  AppearanceList,
  AppearanceId,
} from './types'

export interface FieldId {
  appearanceId: AppearanceId
  propertyId: PropertyId
}

export interface ViewFieldRef extends FieldId {
  viewId: ViewId
  recordId: RecordId
}

export interface RecordFieldRef {
  recordId: RecordId
  propertyId: PropertyId
}

export const sameField = (
  left: FieldId,
  right: FieldId
) => (
  left.appearanceId === right.appearanceId
  && left.propertyId === right.propertyId
)

export const sameViewField = (
  left: ViewFieldRef,
  right: ViewFieldRef
) => (
  left.viewId === right.viewId
  && left.recordId === right.recordId
  && sameField(left, right)
)

export const fieldId = (
  field: Pick<ViewFieldRef, 'appearanceId' | 'propertyId'>
): FieldId => ({
  appearanceId: field.appearanceId,
  propertyId: field.propertyId
})

export const fieldOf = (input: {
  viewId: ViewId
  field: FieldId
  appearances?: Pick<AppearanceList, 'get'>
}): ViewFieldRef | null => {
  const recordId = input.appearances?.get(input.field.appearanceId)?.recordId

  return recordId
    ? {
        viewId: input.viewId,
        appearanceId: input.field.appearanceId,
        recordId,
        propertyId: input.field.propertyId
      }
    : null
}

export const replaceFieldProperty = (
  field: ViewFieldRef,
  propertyId: PropertyId
): ViewFieldRef => ({
  ...field,
  propertyId
})

export const toRecordField = (
  field: FieldId | ViewFieldRef,
  appearances?: Pick<AppearanceList, 'get'>
): RecordFieldRef | null => {
  const recordId = 'recordId' in field
    ? field.recordId
    : appearances?.get(field.appearanceId)?.recordId

  return recordId
    ? {
        recordId,
        propertyId: field.propertyId
      }
    : null
}
