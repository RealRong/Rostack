import type {
  DataDoc,
  DataRecord,
  Sorter
} from '#core/contracts'
import {
  getDocumentFieldById
} from '#core/document'
import {
  compareFieldValues,
  getRecordFieldValue
} from '#core/field'

export const compareSortedRecords = (
  left: DataRecord,
  right: DataRecord,
  sorter: Sorter,
  document: DataDoc
): number => {
  const field = getDocumentFieldById(document, sorter.field)
  const result = compareFieldValues(
    field,
    getRecordFieldValue(left, sorter.field),
    getRecordFieldValue(right, sorter.field)
  )
  if (result === 0) {
    return 0
  }

  return sorter.direction === 'asc'
    ? result
    : -result
}
