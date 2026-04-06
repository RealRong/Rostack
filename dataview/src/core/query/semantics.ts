import type {
  DataDoc,
  FilterRule,
  Grouping,
  Row,
  ResolvedGroupKey,
  Search,
  Sorter
} from '../contracts/state'
import {
  getDocumentFieldById,
  getDocumentCustomFieldById
} from '../document'
import {
  compareFieldValues,
  getFieldSearchTokens,
  getRecordFieldValue,
  matchFieldFilter,
  normalizeSearchableValue,
  resolveFieldGroupBucketEntries
} from '../field'
export {
  normalizeSearchableValue
} from '../field'

export const matchGroupFilter = (
  record: Row,
  rule: FilterRule,
  document: DataDoc
): boolean => {
  if (rule.op === 'custom') {
    return false
  }

  const field = getDocumentFieldById(document, rule.field)
  const value = getRecordFieldValue(record, rule.field)
  return matchFieldFilter(field, value, rule.op, rule.value)
}

export const matchGroupSearch = (
  record: Row,
  search: Search,
  document: DataDoc
): boolean => {
  const query = search.query.trim().toLowerCase()
  if (!query) {
    return true
  }

  const candidates = search.fields?.length
    ? search.fields.flatMap(fieldId => {
        const resolvedField = getDocumentFieldById(document, fieldId)
        return getFieldSearchTokens(resolvedField, getRecordFieldValue(record, fieldId))
      })
    : [
        ...normalizeSearchableValue(record.title),
        ...normalizeSearchableValue(record.type),
        ...normalizeSearchableValue(record.meta),
        ...Object.entries(record.values).flatMap(([fieldId, value]) => getFieldSearchTokens(getDocumentCustomFieldById(document, fieldId), value))
      ]

  return candidates.some(candidate => candidate.toLowerCase().includes(query))
}

export const compareGroupSort = (
  left: Row,
  right: Row,
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

  return sorter.direction === 'asc' ? result : -result
}

export const resolveGroupKey = (
  record: Row,
  groupBy: Grouping,
  document: DataDoc
): ResolvedGroupKey | ResolvedGroupKey[] => {
  const entries = resolveFieldGroupBucketEntries(
    getDocumentFieldById(document, groupBy.field),
    getRecordFieldValue(record, groupBy.field),
    groupBy
  )

  if (entries.length <= 1) {
    return entries[0]?.key
  }

  return entries.map(entry => entry.key)
}
