import type {
  DataDoc,
  DataRecord,
  Sorter
} from '@dataview/core/contracts'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  field as fieldApi
} from '@dataview/core/field'

export const compareSortedRecords = (
  left: DataRecord,
  right: DataRecord,
  sorter: Sorter,
  document: DataDoc
): number => {
  const currentField = documentApi.fields.get(document, sorter.field)
  return fieldApi.compare.sort(
    currentField,
    fieldApi.value.read(left, sorter.field),
    fieldApi.value.read(right, sorter.field),
    sorter.direction
  )
}
