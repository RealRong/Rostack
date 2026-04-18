import type {
  DataDoc,
  DataRecord,
  Sorter
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  compareFieldSortValues,
  getRecordFieldValue
} from '@dataview/core/field'

export const compareSortedRecords = (
  left: DataRecord,
  right: DataRecord,
  sorter: Sorter,
  document: DataDoc
): number => {
  const field = getDocumentFieldById(document, sorter.field)
  return compareFieldSortValues(
    field,
    getRecordFieldValue(left, sorter.field),
    getRecordFieldValue(right, sorter.field),
    sorter.direction
  )
}
