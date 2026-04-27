import type {
  DataDoc,
  DataRecord,
  SortRule
} from '@dataview/core/types'
import {
  documentFields
} from '@dataview/core/document/fields'
import {
  field as fieldApi
} from '@dataview/core/field'

export const compareSortRecords = (
  left: DataRecord,
  right: DataRecord,
  rule: SortRule,
  document: DataDoc
): number => {
  const currentField = documentFields.get(document, rule.fieldId)
  return fieldApi.compare.sort(
    currentField,
    fieldApi.value.read(left, rule.fieldId),
    fieldApi.value.read(right, rule.fieldId),
    rule.direction
  )
}
