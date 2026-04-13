import type {
  DataDoc,
  DataRecord,
  Sorter
} from '#core/contracts/index.ts'
import {
  getDocumentFieldById
} from '#core/document/index.ts'
import {
  compareFieldValues,
  getRecordFieldValue
} from '#core/field/index.ts'

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
