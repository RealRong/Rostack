import type {
  DataDoc,
  DataRecord,
  Search
} from '@dataview/core/contracts'
import {
  getDocumentCustomFieldById,
  getDocumentFieldById
} from '@dataview/core/document'
import {
  getFieldSearchTokens,
  getRecordFieldValue,
  normalizeSearchableValue
} from '@dataview/core/field'

export const matchSearchRecord = (
  record: DataRecord,
  search: Search,
  document: DataDoc
): boolean => {
  const query = search.query.trim().toLowerCase()
  if (!query) {
    return true
  }

  const candidates = search.fields?.length
    ? search.fields.flatMap(fieldId => {
        const field = getDocumentFieldById(document, fieldId)
        return getFieldSearchTokens(field, getRecordFieldValue(record, fieldId))
      })
    : [
        ...normalizeSearchableValue(record.title),
        ...normalizeSearchableValue(record.type),
        ...normalizeSearchableValue(record.meta),
        ...Object.entries(record.values).flatMap(([fieldId, value]) => (
          getFieldSearchTokens(
            getDocumentCustomFieldById(document, fieldId),
            value
          )
        ))
      ]

  return candidates.some(candidate => candidate.toLowerCase().includes(query))
}
