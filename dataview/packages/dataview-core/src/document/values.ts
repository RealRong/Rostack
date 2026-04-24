import type {
  DataRecord,
  FieldId
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'

const fieldIds = (
  record: DataRecord
): readonly FieldId[] => [
  TITLE_FIELD_ID,
  ...Object.keys(record.values) as FieldId[]
]

const get = (
  record: DataRecord,
  fieldId: FieldId
): unknown | undefined => fieldId === TITLE_FIELD_ID
  ? record.title
  : record.values[fieldId]

const entries = (
  record: DataRecord
): readonly (readonly [FieldId, unknown])[] => fieldIds(record).flatMap(fieldId => {
  const value = get(record, fieldId)
  return value === undefined
    ? []
    : [[fieldId, value] as const]
})

export const documentValues = {
  get,
  fieldIds,
  entries
} as const
