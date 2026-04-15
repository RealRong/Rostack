import {
  collectSchemaFieldIds,
  collectTouchedFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  hasRecordSetChange
} from '@dataview/core/commit/impact'
import type {
  CommitImpact,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  hasDocumentField,
  getDocumentFieldIds
} from '@dataview/core/document'

export const createOrderIndex = <T extends string>(
  ids: readonly T[]
): ReadonlyMap<T, number> => new Map(
  ids.map((id, index) => [id, index] as const)
)

export const removeOrderedId = <T extends string>(
  ids: readonly T[],
  id: T
): readonly T[] => {
  const index = ids.indexOf(id)
  if (index < 0) {
    return ids
  }

  return [
    ...ids.slice(0, index),
    ...ids.slice(index + 1)
  ]
}

export const insertOrderedId = <T extends string>(
  ids: readonly T[],
  id: T,
  order: ReadonlyMap<T, number>
): readonly T[] => {
  if (ids.includes(id)) {
    return ids
  }

  const nextOrder = order.get(id) ?? Number.MAX_SAFE_INTEGER
  const next = [...ids]
  const index = next.findIndex(current => (
    (order.get(current) ?? Number.MAX_SAFE_INTEGER) > nextOrder
  ))

  if (index < 0) {
    next.push(id)
    return next
  }

  next.splice(index, 0, id)
  return next
}

export const allFieldIdsOf = (
  document: DataDoc,
  previous?: ReadonlyMap<FieldId, unknown>
): readonly FieldId[] => {
  const ids = new Set<FieldId>(getDocumentFieldIds(document))
  previous?.forEach((_value, fieldId) => ids.add(fieldId))
  return Array.from(ids)
}

export {
  collectSchemaFieldIds,
  collectValueFieldIds,
  collectTouchedFieldIds,
  collectTouchedRecordIds,
  hasRecordSetChange
}

export const hasField = (
  document: DataDoc,
  fieldId: FieldId
): boolean => hasDocumentField(document, fieldId)

export const hasIndexChanges = (
  impact: CommitImpact
): boolean => Boolean(
  impact.reset
  || impact.records
  || impact.fields?.schema
)

export const touchesRecord = (
  impact: CommitImpact,
  recordId: RecordId
): boolean => {
  const touched = collectTouchedRecordIds(impact)
  return touched === 'all'
    ? true
    : touched.has(recordId)
}
