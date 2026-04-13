import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  compareFieldValues
} from '@dataview/core/field'
import {
  createFieldSyncContext,
  ensureFieldIndexes,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '#engine/active/index/sync'
import type {
  RecordIndex,
  SortFieldIndex,
  SortIndex
} from '#engine/active/index/contracts'

const MAX_INCREMENTAL_TOUCHES = 64

const compareSortValues = (
  field: ReturnType<typeof getDocumentFieldById>,
  left: unknown,
  right: unknown
): number => {
  if (field?.kind === 'number' && typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return compareFieldValues(field, left, right)
}

const compareRecordIds = (input: {
  field: ReturnType<typeof getDocumentFieldById>
  values: ReadonlyMap<RecordId, unknown>
  order: ReadonlyMap<RecordId, number>
  leftId: RecordId
  rightId: RecordId
}) => {
  const result = compareSortValues(
    input.field,
    input.values.get(input.leftId),
    input.values.get(input.rightId)
  )

  if (result !== 0) {
    return result
  }

  return (input.order.get(input.leftId) ?? Number.MAX_SAFE_INTEGER)
    - (input.order.get(input.rightId) ?? Number.MAX_SAFE_INTEGER)
}

const buildFieldSortIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): SortFieldIndex => {
  const field = getDocumentFieldById(document, fieldId)
  const values = records.values.get(fieldId) ?? new Map<RecordId, unknown>()
  const asc = records.ids.slice().sort((leftId, rightId) => compareRecordIds({
    field,
    values,
    order: records.order,
    leftId,
    rightId
  }))

  return {
    asc,
    desc: asc.slice().reverse()
  }
}

const indexOfId = (
  ids: readonly RecordId[],
  target: RecordId
): number => ids.findIndex(id => id === target)

const insertAscId = (input: {
  ids: RecordId[]
  recordId: RecordId
  field: ReturnType<typeof getDocumentFieldById>
  values: ReadonlyMap<RecordId, unknown>
  order: ReadonlyMap<RecordId, number>
}): void => {
  let low = 0
  let high = input.ids.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const current = input.ids[middle]
    const comparison = compareRecordIds({
      field: input.field,
      values: input.values,
      order: input.order,
      leftId: current,
      rightId: input.recordId
    })

    if (comparison <= 0) {
      low = middle + 1
      continue
    }

    high = middle
  }

  input.ids.splice(low, 0, input.recordId)
}

const syncFieldSortIndex = (input: {
  previous: SortFieldIndex
  document: DataDoc
  records: RecordIndex
  fieldId: FieldId
  touchedRecords: ReadonlySet<RecordId>
}): SortFieldIndex => {
  if (input.touchedRecords.size > MAX_INCREMENTAL_TOUCHES) {
    return buildFieldSortIndex(input.document, input.records, input.fieldId)
  }

  const field = getDocumentFieldById(input.document, input.fieldId)
  const values = input.records.values.get(input.fieldId) ?? new Map<RecordId, unknown>()
  let nextAsc: RecordId[] | undefined

  input.touchedRecords.forEach(recordId => {
    const target = nextAsc ?? input.previous.asc.slice()
    const index = indexOfId(target, recordId)
    if (index >= 0) {
      target.splice(index, 1)
    }

    if (!input.records.order.has(recordId)) {
      nextAsc = target
      return
    }

    insertAscId({
      ids: target,
      recordId,
      field,
      values,
      order: input.records.order
    })
    nextAsc = target
  })

  return !nextAsc
    ? input.previous
    : {
        asc: nextAsc,
        desc: nextAsc.slice().reverse()
      }
}

export const buildSortIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): SortIndex => {
  const base: SortIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureSortIndex(base, document, records, fieldIds)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureSortIndex = (
  previous: SortIndex,
  document: DataDoc,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = []
): SortIndex => {
  const ensured = ensureFieldIndexes({
    previous: previous.fields,
    document,
    fieldIds,
    build: fieldId => buildFieldSortIndex(document, records, fieldId)
  })

  return ensured.changed
    ? {
        fields: ensured.fields,
        rev: previous.rev + 1
      }
    : previous
}

export const syncSortIndex = (
  previous: SortIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): SortIndex => {
  if (!delta.summary.indexes || !previous.fields.size) {
    return previous
  }

  const loadedFieldIds = new Set(previous.fields.keys())
  const context = createFieldSyncContext(delta, {
    includeTitlePatch: true
  })
  let changed = false
  const nextFields = new Map(previous.fields)

  Array.from(loadedFieldIds).forEach(fieldId => {
    if (shouldDropFieldIndex(document, context, fieldId)) {
      nextFields.delete(fieldId)
      changed = true
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      nextFields.set(fieldId, buildFieldSortIndex(document, records, fieldId))
      changed = true
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const previousField = previous.fields.get(fieldId)
    if (!previousField) {
      return
    }

    const nextField = syncFieldSortIndex({
      previous: previousField,
      document,
      records,
      fieldId,
      touchedRecords: context.touchedRecords
    })
    if (nextField !== previousField) {
      nextFields.set(fieldId, nextField)
      changed = true
    }
  })

  return changed
    ? {
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}
