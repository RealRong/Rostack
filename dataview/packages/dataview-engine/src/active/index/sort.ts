import type {
  Field,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import { equal } from '@shared/core'
import { createMapPatchBuilder } from '@dataview/engine/active/shared/patch'
import type {
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex,
  SortFieldIndex,
  SortIndex
} from '@dataview/engine/active/index/contracts'
import {
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'

const MAX_INCREMENTAL_TOUCH_RATIO = 0.25
const EMPTY_VALUE_MAP = new Map<RecordId, unknown>()
type SortScalar = string | number | boolean

const compareSortScalars = (
  left: SortScalar,
  right: SortScalar
): number => {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right)
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return left === right
      ? 0
      : left
        ? 1
        : -1
  }

  return 0
}

const buildSortScalars = (
  values: ReadonlyMap<RecordId, unknown>,
  scalarOf: (value: unknown) => SortScalar | undefined
): ReadonlyMap<RecordId, SortScalar> => {
  const sortScalars = new Map<RecordId, SortScalar>()
  values.forEach((value, recordId) => {
    const scalar = scalarOf(value)
    if (scalar !== undefined) {
      sortScalars.set(recordId, scalar)
    }
  })

  return sortScalars
}

const compareSortValues = (input: {
  field: Field | undefined
  left: unknown
  right: unknown
  leftScalar: SortScalar | undefined
  rightScalar: SortScalar | undefined
}): number => {
  const leftEmpty = fieldApi.value.empty(input.left)
  const rightEmpty = fieldApi.value.empty(input.right)
  if (leftEmpty || rightEmpty) {
    if (leftEmpty === rightEmpty) {
      return 0
    }

    return leftEmpty ? 1 : -1
  }

  if (
    input.leftScalar !== undefined
    && input.rightScalar !== undefined
  ) {
    return compareSortScalars(input.leftScalar, input.rightScalar)
  }

  return fieldApi.compare.value(input.field, input.left, input.right)
}

const createRecordComparator = (input: {
  field: Field | undefined
  values: ReadonlyMap<RecordId, unknown>
  order: ReadonlyMap<RecordId, number>
  sortScalars?: ReadonlyMap<RecordId, SortScalar>
}) => (
  leftId: RecordId,
  rightId: RecordId
) => {
  const left = input.values.get(leftId)
  const right = input.values.get(rightId)
  const result = compareSortValues({
    field: input.field,
    left,
    right,
    leftScalar: input.sortScalars?.get(leftId),
    rightScalar: input.sortScalars?.get(rightId)
  })

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
  const scalarOf = fieldSpec.index.sort.of(field)
  const sortScalars = scalarOf
    ? buildSortScalars(values, scalarOf)
    : undefined
  const compare = createRecordComparator({
    field,
    values,
    order: records.order,
    sortScalars
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
  const scalarOf = fieldSpec.index.sort.of(field)
  const sortScalars = scalarOf
    ? buildSortScalars(values, scalarOf)
    : undefined
  const compare = createRecordComparator({
    field,
    values,
    order: input.records.order,
    sortScalars
  })
  const remaining = input.previous.asc.filter(recordId => (
    !input.touchedRecords.has(recordId)
    && input.records.order.has(recordId)
  ))
  const moving = Array.from(input.touchedRecords).filter(recordId => input.records.order.has(recordId))

  if (!moving.length) {
    return remaining.length === input.previous.asc.length
      && equal.sameOrder(remaining, input.previous.asc)
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

  return equal.sameOrder(asc, input.previous.asc)
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
  const built = reconcileSortIndex({
    previous: base,
    context,
    records,
    fieldIds
  })

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const reconcileSortIndex = (input: {
  previous: SortIndex,
  context: IndexReadContext | IndexDeriveContext,
  records: RecordIndex,
  fieldIds: readonly FieldId[]
}): SortIndex => {
  const fields = createMapPatchBuilder(input.previous.fields)
  const demanded = new Set(input.fieldIds)

  input.previous.fields.forEach((_, fieldId) => {
    if (!demanded.has(fieldId)) {
      fields.delete(fieldId)
    }
  })

  for (let index = 0; index < input.fieldIds.length; index += 1) {
    const fieldId = input.fieldIds[index]!
    if (fields.has(fieldId) || !input.context.fieldIdSet.has(fieldId)) {
      continue
    }

    fields.set(fieldId, buildFieldSortIndex(input.context, input.records, fieldId))
  }

  return fields.changed()
    ? {
        fields: fields.finish(),
        rev: input.previous.rev + 1
      }
    : input.previous
}

export const syncSortIndex = (
  previous: SortIndex,
  context: IndexDeriveContext,
  records: RecordIndex
): SortIndex => {
  if (!context.changed || !previous.fields.size) {
    return previous
  }

  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((previousField, fieldId) => {
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      fields.delete(fieldId)
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      fields.set(fieldId, buildFieldSortIndex(context, records, fieldId))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const nextField = syncFieldSortIndex({
      previous: previousField,
      context,
      records,
      fieldId,
      touchedRecords: context.touchedRecords
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

export const deriveSortIndex = (input: {
  previous: SortIndex
  context: IndexDeriveContext
  records: RecordIndex
  fieldIds: readonly FieldId[]
}): SortIndex => reconcileSortIndex({
  previous: syncSortIndex(input.previous, input.context, input.records),
  context: input.context,
  records: input.records,
  fieldIds: input.fieldIds
})
