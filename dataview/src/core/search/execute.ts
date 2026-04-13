import type {
  CustomField,
  DataDoc,
  DataRecord,
  Search
} from '#core/contracts'
import {
  getDocumentCustomFieldById,
  getDocumentFieldById
} from '#core/document'
import {
  getFieldSearchTokens,
  getRecordFieldValue,
  normalizeSearchableValue
} from '#core/field'

const isDefaultSearchField = (
  field: CustomField | undefined
): boolean => {
  switch (field?.kind) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'multiSelect':
    case 'status':
      return true
    default:
      return false
  }
}

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
        ...Object.entries(record.values).flatMap(([fieldId, value]) => {
          const field = getDocumentCustomFieldById(document, fieldId)
          return isDefaultSearchField(field)
            ? getFieldSearchTokens(field, value)
            : []
        })
      ]

  return candidates.some(candidate => candidate.toLowerCase().includes(query))
}
