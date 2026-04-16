import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  sameOrder as sameIds
} from '@shared/core'
import {
  createArrayPatchBuilder,
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex,
  RecordValueIndex
} from '@dataview/engine/active/index/contracts'
import {
  createOrderIndex,
  insertOrderedIdInPlace,
  removeOrderedIdInPlace
} from '@dataview/engine/active/shared/ordered'

const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()
const EMPTY_RECORD_IDS: readonly RecordId[] = []

const readFieldValue = (
  row: DataDoc['records']['byId'][RecordId] | undefined,
  fieldId: FieldId
): unknown => (
  fieldId === TITLE_FIELD_ID
    ? row?.title
    : row?.values[fieldId]
)

const buildValueIndex = (
  document: DataDoc,
  fieldId: FieldId
): RecordValueIndex => {
  const byRecord = new Map<RecordId, unknown>()
  const ids: RecordId[] = []

  document.records.order.forEach(recordId => {
    const value = readFieldValue(document.records.byId[recordId], fieldId)
    if (value === undefined) {
      return
    }

    byRecord.set(recordId, value)
    ids.push(recordId)
  })

  return {
    byRecord,
    ids
  }
}

const syncValueIndex = (input: {
  previous: RecordValueIndex
  document: DataDoc
  fieldId: FieldId
  order: ReadonlyMap<RecordId, number>
  touchedRecords: ReadonlySet<RecordId>
}): RecordValueIndex => {
  const previousValues = input.previous.byRecord
  let values = createMapPatchBuilder(previousValues)
  let ids = createArrayPatchBuilder(input.previous.ids)
  let valuesUsed = false
  let idsUsed = false
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const previousHas = previousValues.has(recordId)
    const previousValue = previousValues.get(recordId)
    const nextValue = readFieldValue(input.document.records.byId[recordId], input.fieldId)
    const nextHas = nextValue !== undefined

    if (previousHas === nextHas && previousValue === nextValue) {
      return
    }

    changed = true

    if (nextHas) {
      values.set(recordId, nextValue)
    } else {
      values.delete(recordId)
    }
    valuesUsed = true

    if (previousHas === nextHas) {
      return
    }

    ids.mutate(draft => {
      if (nextHas) {
        insertOrderedIdInPlace(draft, recordId, input.order)
        return
      }

      removeOrderedIdInPlace(draft, recordId, input.order)
    })
    idsUsed = true
  })

  return !changed
    ? input.previous
    : {
        byRecord: valuesUsed ? values.finish() : previousValues,
        ids: idsUsed ? ids.finish() : input.previous.ids
      }
}

const shouldRebuildRecordIndex = (
  context: IndexDeriveContext
): boolean => context.touchedRecords === 'all'
  || context.valueFields === 'all'

export const buildRecordIndex = (
  context: IndexReadContext,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): RecordIndex => ({
  ids: [...context.document.records.order],
  fieldIds: [...fieldIds],
  order: createOrderIndex(context.document.records.order),
  byId: context.document.records.byId,
  values: new Map(
    fieldIds.map(fieldId => [fieldId, buildValueIndex(context.document, fieldId)] as const)
  ),
  rev
})

export const syncRecordIndex = (
  previous: RecordIndex,
  context: IndexDeriveContext,
  fieldIds: readonly FieldId[] = previous.fieldIds
): RecordIndex => {
  const nextFieldIds = sameIds(previous.fieldIds, fieldIds)
    ? previous.fieldIds
    : [...fieldIds]
  const fieldIdsChanged = previous.fieldIds !== nextFieldIds

  if (!context.changed) {
    if (!fieldIdsChanged) {
      return previous
    }

    const nextFieldSet = new Set(nextFieldIds)
    const values = createMapPatchBuilder(previous.values)

    previous.fieldIds.forEach(fieldId => {
      if (!nextFieldSet.has(fieldId)) {
        values.delete(fieldId)
      }
    })

    nextFieldIds.forEach(fieldId => {
      if (!previous.values.has(fieldId)) {
        values.set(fieldId, buildValueIndex(context.document, fieldId))
      }
    })

    return {
      ids: previous.ids,
      fieldIds: nextFieldIds,
      order: previous.order,
      byId: previous.byId,
      values: values.finish(),
      rev: previous.rev + 1
    }
  }

  if (shouldRebuildRecordIndex(context)) {
    return buildRecordIndex(context, nextFieldIds, previous.rev + 1)
  }

  const touchedRecords = context.touchedRecords
  if (touchedRecords === 'all') {
    return buildRecordIndex(context, nextFieldIds, previous.rev + 1)
  }

  const orderChanged = !sameIds(previous.ids, context.document.records.order)
  const nextOrder = orderChanged
    ? createOrderIndex(context.document.records.order)
    : previous.order
  const nextFieldSet = new Set(nextFieldIds)
  const values = createMapPatchBuilder(previous.values)

  if (fieldIdsChanged) {
    previous.fieldIds.forEach(fieldId => {
      if (!nextFieldSet.has(fieldId)) {
        values.delete(fieldId)
      }
    })

    nextFieldIds.forEach(fieldId => {
      if (!previous.values.has(fieldId)) {
        values.set(fieldId, buildValueIndex(context.document, fieldId))
      }
    })
  }

  let fieldsToSync = nextFieldIds
  const touchedFields = context.touchedFields
  if (!context.recordSetChanged && touchedFields !== 'all') {
    fieldsToSync = nextFieldIds.filter(fieldId => touchedFields.has(fieldId))
  }

  fieldsToSync.forEach(fieldId => {
    const previousColumn = values.get(fieldId)
      ?? previous.values.get(fieldId)
      ?? {
        byRecord: EMPTY_VALUE_MAP,
        ids: EMPTY_RECORD_IDS
      }
    const nextColumn = syncValueIndex({
      previous: previousColumn,
      document: context.document,
      fieldId,
      order: nextOrder,
      touchedRecords
    })

    if (nextColumn !== previousColumn) {
      values.set(fieldId, nextColumn)
    }
  })

  const ids = orderChanged
    ? [...context.document.records.order]
    : previous.ids
  const byId = context.document.records.byId

  if (
    !fieldIdsChanged
    && !orderChanged
    && !values.changed()
    && byId === previous.byId
  ) {
    return previous
  }

  return {
    ids,
    fieldIds: nextFieldIds,
    order: nextOrder,
    byId,
    values: values.finish(),
    rev: previous.rev + 1
  }
}
