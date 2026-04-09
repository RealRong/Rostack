import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
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

export const collectSchemaFieldIds = (
  delta: CommitDelta
): ReadonlySet<FieldId> => {
  const ids = new Set<FieldId>()
  delta.entities.fields?.add?.forEach(fieldId => ids.add(fieldId))
  if (Array.isArray(delta.entities.fields?.update)) {
    delta.entities.fields.update.forEach(fieldId => ids.add(fieldId))
  }
  delta.entities.fields?.remove?.forEach(fieldId => ids.add(fieldId))
  delta.semantics.forEach(item => {
    if (item.kind === 'field.schema') {
      ids.add(item.fieldId)
    }
  })
  return ids
}

export const collectValueFieldIds = (
  delta: CommitDelta,
  options?: {
    includeTitlePatch?: boolean
  }
): ReadonlySet<FieldId> => {
  const ids = new Set<FieldId>()
  if (Array.isArray(delta.entities.values?.fields)) {
    delta.entities.values.fields.forEach(fieldId => ids.add(fieldId))
  }
  delta.semantics.forEach(item => {
    if (item.kind === 'record.values' && Array.isArray(item.fields)) {
      item.fields.forEach(fieldId => ids.add(fieldId))
    }
  })

  if (options?.includeTitlePatch) {
    delta.semantics.forEach(item => {
      if (item.kind === 'record.patch' && item.aspects.includes('title')) {
        ids.add('title')
      }
    })
  }

  return ids
}

export const collectTouchedRecordIds = (
  delta: CommitDelta
): ReadonlySet<RecordId> | 'all' => {
  if (
    delta.entities.records?.update === 'all'
    || delta.entities.values?.records === 'all'
  ) {
    return 'all'
  }

  const ids = new Set<RecordId>()
  delta.entities.records?.add?.forEach(id => ids.add(id))
  if (Array.isArray(delta.entities.records?.update)) {
    delta.entities.records.update.forEach(id => ids.add(id))
  }
  delta.entities.records?.remove?.forEach(id => ids.add(id))
  if (Array.isArray(delta.entities.values?.records)) {
    delta.entities.values.records.forEach(id => ids.add(id))
  }
  delta.semantics.forEach(item => {
    if (item.kind === 'record.add' || item.kind === 'record.remove') {
      item.ids.forEach(id => ids.add(id))
    }
    if (item.kind === 'record.patch') {
      item.ids.forEach(id => ids.add(id))
    }
    if (item.kind === 'record.values' && Array.isArray(item.records)) {
      item.records.forEach(id => ids.add(id))
    }
  })
  return ids
}

export const hasRecordSetChange = (
  delta: CommitDelta
): boolean => Boolean(
  delta.entities.records?.add?.length
  || delta.entities.records?.remove?.length
)

export const hasField = (
  document: DataDoc,
  fieldId: FieldId
): boolean => Boolean(getDocumentFieldById(document, fieldId))
