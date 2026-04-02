import type {
  PropertyId,
  GroupDocument,
  GroupFilterRule,
  GroupGroupBy,
  GroupRecord,
  GroupResolvedGroupKey,
  GroupSearch,
  GroupSorter
} from '../contracts/state'
import { getDocumentPropertyById } from '../document'
import {
  comparePropertyValues,
  getPropertySearchTokens,
  matchPropertyFilter,
  normalizeSearchableValue,
  resolveGroupBucketEntries
} from '../property'
export {
  normalizeSearchableValue
} from '../property'

export const getRecordPropertyValue = (record: GroupRecord, property: PropertyId): unknown => record.values[property]

export const matchGroupFilter = (
  record: GroupRecord,
  rule: GroupFilterRule,
  document: GroupDocument
): boolean => {
  if (rule.op === 'custom') {
    return false
  }

  const property = getDocumentPropertyById(document, rule.property)
  const value = getRecordPropertyValue(record, rule.property)
  return matchPropertyFilter(property, value, rule.op, rule.value)
}

export const matchGroupSearch = (
  record: GroupRecord,
  search: GroupSearch,
  document: GroupDocument
): boolean => {
  const query = search.query.trim().toLowerCase()
  if (!query) {
    return true
  }

  const candidates = search.properties?.length
    ? search.properties.flatMap(property => {
        const resolvedProperty = getDocumentPropertyById(document, property)
        return getPropertySearchTokens(resolvedProperty, getRecordPropertyValue(record, property))
      })
    : [
        ...normalizeSearchableValue(record.type),
        ...normalizeSearchableValue(record.meta),
        ...Object.entries(record.values).flatMap(([propertyId, value]) => getPropertySearchTokens(getDocumentPropertyById(document, propertyId), value))
      ]

  return candidates.some(candidate => candidate.toLowerCase().includes(query))
}

export const compareGroupSort = (
  left: GroupRecord,
  right: GroupRecord,
  sorter: GroupSorter,
  document: GroupDocument
): number => {
  const property = getDocumentPropertyById(document, sorter.property)
  const result = comparePropertyValues(
    property,
    getRecordPropertyValue(left, sorter.property),
    getRecordPropertyValue(right, sorter.property)
  )
  if (result === 0) {
    return 0
  }

  return sorter.direction === 'asc' ? result : -result
}

export const resolveGroupKey = (
  record: GroupRecord,
  groupBy: GroupGroupBy,
  document: GroupDocument
): GroupResolvedGroupKey | GroupResolvedGroupKey[] => {
  const entries = resolveGroupBucketEntries(
    getDocumentPropertyById(document, groupBy.property),
    getRecordPropertyValue(record, groupBy.property),
    groupBy
  )

  if (entries.length <= 1) {
    return entries[0]?.key
  }

  return entries.map(entry => entry.key)
}
