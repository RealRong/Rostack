import type {
  DataDoc,
  DataRecord,
  SortRule
} from '@dataview/core/contracts'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  field as fieldApi
} from '@dataview/core/field'

export const compareSortRecords = (
  left: DataRecord,
  right: DataRecord,
  rule: SortRule,
  document: DataDoc
): number => {
  const currentField = documentApi.fields.get(document, rule.fieldId)
  return fieldApi.compare.sort(
    currentField,
    fieldApi.value.read(left, rule.fieldId),
    fieldApi.value.read(right, rule.fieldId),
    rule.direction
  )
}
