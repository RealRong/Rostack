import type {
  Field,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  compareFieldValues
} from '@dataview/core/field'
import { sameOrder } from '@shared/core'
import { createMapPatchBuilder } from '@dataview/engine/active/index/builder'
import type {
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex,
  SortFieldIndex,
  SortIndex
} from '@dataview/engine/active/index/contracts'
import {
  ensureFieldIndexes,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'

const MAX_INCREMENTAL_TOUCH_RATIO = 0.25
const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()

const compareSortValues = (
  field: Field | undefined,
  left: unknown,
  right: unknown
): number => {
  if (field?.kind === 'number' && typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return compareFieldValues(field, left, right)
}

const createRecordComparator = (input: {
  field: Field | undefined
  values: ReadonlyMap<RecordId, unknown>
  order: ReadonlyMap<RecordId, number>
}) => (
  leftId: RecordId,
  rightId: RecordId
) => {
  const result = compareSortValues(
    input.field,
    input.values.get(leftId),
    input.values.get(rightId)
  )

  if (result !== 0) {
    return result
  }

  return (input.order.get(leftId) ?? Number.MAX_SAFE_INTEGER)
    - (input.order.get(rightId) ?? Number.MAX_SAFE_INTEGER)
}

const buildFieldSortIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldId: FieldId
): SortFieldIndex => {
  const field = context.reader.fields.get(fieldId)
  const values = records.values.get(fieldId)?.byRecord ?? EMPTY_VALUE_MAP
  const compare = createRecordComparator({
    field,
    values,
    order: records.order
  })
  const asc = records.ids.slice().sort(compare)

  return {
    asc
  }
}

const mergeSortedIds = (input: {
  left: readonly RecordId[]
  right: readonly RecordId[]
  compare: (leftId: RecordId, rightId: RecordId) => number
}): readonly RecordId[] => {
  const merged: RecordId[] = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < input.left.length && rightIndex < input.right.length) {
    if (input.compare(input.left[leftIndex], input.right[rightIndex]) <= 0) {
      merged.push(input.left[leftIndex])
      leftIndex += 1
      continue
    }

    merged.push(input.right[rightIndex])
    rightIndex += 1
  }

  while (leftIndex < input.left.length) {
    merged.push(input.left[leftIndex])
    leftIndex += 1
  }
  while (rightIndex < input.right.length) {
    merged.push(input.right[rightIndex])
    rightIndex += 1
  }

  return merged
}

const syncFieldSortIndex = (input: {
  previous: SortFieldIndex
  context: IndexDeriveContext
  records: RecordIndex
  fieldId: FieldId
  touchedRecords: ReadonlySet<RecordId>
}): SortFieldIndex => {
  if (input.touchedRecords.size > input.previous.asc.length * MAX_INCREMENTAL_TOUCH_RATIO) {
    return buildFieldSortIndex(input.context, input.records, input.fieldId)
  }

  const field = input.context.reader.fields.get(input.fieldId)
  const values = input.records.values.get(input.fieldId)?.byRecord ?? EMPTY_VALUE_MAP
  const compare = createRecordComparator({
    field,
    values,
    order: input.records.order
  })
  const remaining = input.previous.asc.filter(recordId => (
    !input.touchedRecords.has(recordId)
    && input.records.order.has(recordId)
  ))
  const moving = Array.from(input.touchedRecords).filter(recordId => input.records.order.has(recordId))

  if (!moving.length) {
    return remaining.length === input.previous.asc.length
      && sameOrder(remaining, input.previous.asc)
      ? input.previous
      : {
          asc: remaining
        }
  }

  moving.sort(compare)

  const asc = mergeSortedIds({
    left: remaining,
    right: moving,
    compare
  })

  return sameOrder(asc, input.previous.asc)
    ? input.previous
    : {
        asc
      }
}

export const buildSortIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = [],
  rev = 1
): SortIndex => {
  const base: SortIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureSortIndex(base, context, records, fieldIds)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureSortIndex = (
  previous: SortIndex,
  context: IndexReadContext,
  records: RecordIndex,
  fieldIds: readonly FieldId[] = []
): SortIndex => {
  const ensured = ensureFieldIndexes({
    previous: previous.fields,
    hasField: fieldId => context.fieldIdSet.has(fieldId),
    fieldIds,
    build: fieldId => buildFieldSortIndex(context, records, fieldId)
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
  context: IndexDeriveContext,
  records: RecordIndex
): SortIndex => {
  if (!context.impact.changed || !previous.fields.size) {
    return previous
  }

  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((previousField, fieldId) => {
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context.impact, fieldId)) {
      fields.delete(fieldId)
      return
    }

    if (shouldRebuildFieldIndex(context.impact, fieldId)) {
      fields.set(fieldId, buildFieldSortIndex(context, records, fieldId))
      return
    }

    if (!shouldSyncFieldIndex(context.impact, fieldId)) {
      return
    }

    const nextField = syncFieldSortIndex({
      previous: previousField,
      context,
      records,
      fieldId,
      touchedRecords: context.impact.touchedRecords
    })
    if (nextField !== previousField) {
      fields.set(fieldId, nextField)
    }
  })

  return fields.changed()
    ? {
        fields: fields.finish(),
        rev: previous.rev + 1
      }
    : previous
}
