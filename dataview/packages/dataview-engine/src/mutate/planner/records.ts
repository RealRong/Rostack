import type {
  Action,
  DataRecord,
  FieldId,
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import { isCustomField } from '@dataview/core/field'
import {
  readFieldSpec
} from '@dataview/core/field/spec'
import {
  isNonEmptyString,
  trimToUndefined
} from '@shared/core'
import { createRecordId } from '@dataview/engine/mutate/entityId'
import type {
  PlannedActionResult,
  PlannerScope
} from '@dataview/engine/mutate/planner/scope'

const toViewPut = (
  view: View
): DocumentOperation => ({
  type: 'document.view.put',
  view
})

const buildRecordRemoveViewOps = (
  reader: PlannerScope['reader'],
  recordIds: readonly RecordId[]
): DocumentOperation[] => {
  const removedRecordIdSet = new Set(recordIds)
  return reader.views.list().flatMap(view => {
    const nextOrders = reader.records.normalize(
      view.orders.filter(recordId => !removedRecordIdSet.has(recordId))
    )
    return nextOrders.length === view.orders.length
      && nextOrders.every((recordId, index) => recordId === view.orders[index])
      ? []
      : [toViewPut({
          ...view,
          orders: nextOrders
        })]
  })
}

const resolveDefaultRecordType = (
  reader: PlannerScope['reader']
) => reader.records.list().find(record => typeof record.type === 'string' && record.type.length)?.type

const resolveRecordCreateValues = (
  reader: PlannerScope['reader'],
  explicitValues: Extract<Action, { type: 'record.create' }>['input']['values']
) => {
  const nextValues = {
    ...(explicitValues ?? {})
  }

  reader.fields.list().forEach(field => {
    if (!isCustomField(field)) {
      return
    }
    if (explicitValues && Object.prototype.hasOwnProperty.call(explicitValues, field.id)) {
      return
    }
    const defaultValue = readFieldSpec(field)?.create.defaultValue?.(field)
    if (defaultValue === undefined) {
      return
    }
    nextValues[field.id] = defaultValue
  })

  return nextValues
}

const requireRecordIds = (
  scope: PlannerScope,
  recordIds: readonly string[],
  path: string
): readonly RecordId[] | undefined => {
  const nextRecordIds = [...new Set(recordIds)] as RecordId[]
  if (!nextRecordIds.length) {
    scope.issue(
      'batch.emptyCollection',
      `${scope.source.type} requires at least one item`,
      path
    )
    return undefined
  }

  const resolved: RecordId[] = []
  nextRecordIds.forEach((recordId, index) => {
    if (!scope.reader.records.has(recordId)) {
      scope.issue(
        'record.notFound',
        `Unknown record: ${recordId}`,
        `${path}.${index}`
      )
      return
    }

    resolved.push(recordId)
  })

  return resolved.length === nextRecordIds.length
    ? resolved
    : undefined
}

const validateWritableField = (
  scope: PlannerScope,
  fieldId: FieldId,
  path: string
): boolean => {
  if (!isNonEmptyString(fieldId)) {
    scope.issue(
      'record.fields.invalidField',
      'record.fields.writeMany requires non-empty field ids',
      path
    )
    return false
  }

  if (fieldId !== TITLE_FIELD_ID && !scope.reader.fields.has(fieldId)) {
    scope.issue(
      'field.notFound',
      `Unknown field: ${fieldId}`,
      path
    )
    return false
  }

  return true
}

const lowerRecordCreate = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'record.create' }>
): PlannedActionResult => {
  const explicitRecordId = trimToUndefined(action.input.id)

  if (action.input.id !== undefined && !explicitRecordId) {
    scope.issue(
      'record.invalidId',
      'Record id must be a non-empty string',
      'input.id'
    )
  }
  if (explicitRecordId && scope.reader.records.has(explicitRecordId)) {
    scope.issue(
      'record.duplicateId',
      `Record already exists: ${explicitRecordId}`,
      'input.id'
    )
  }
  if ((action.input.id !== undefined && !explicitRecordId) || (explicitRecordId && scope.reader.records.has(explicitRecordId))) {
    return scope.finish()
  }

  const record = {
    id: explicitRecordId || createRecordId(),
    title: trimToUndefined(action.input.title) ?? '',
    type: action.input.type ?? resolveDefaultRecordType(scope.reader),
    values: resolveRecordCreateValues(scope.reader, action.input.values),
    meta: action.input.meta
  } satisfies DataRecord

  return scope.finish({
    type: 'document.record.insert',
    records: [record]
  })
}

const lowerRecordPatch = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'record.patch' }>
): PlannedActionResult => {
  const recordIds = scope.resolveTarget(action.target)
  if (!recordIds) {
    return scope.finish()
  }

  if (!Object.keys(action.patch).length) {
    scope.issue(
      'record.emptyPatch',
      'record.patch patch cannot be empty',
      'patch'
    )
  }
  if (Object.prototype.hasOwnProperty.call(action.patch, 'values')) {
    scope.issue(
      'record.invalidPatch',
      'record.patch does not support values; use record.fields.writeMany',
      'patch.values'
    )
  }

  return scope.finish(...recordIds.map((recordId): DocumentOperation => ({
    type: 'document.record.patch',
    recordId,
    patch: action.patch
  })))
}

const lowerRecordRemove = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'record.remove' }>
): PlannedActionResult => {
  const recordIds = requireRecordIds(scope, action.recordIds, 'recordIds')
  if (!recordIds) {
    return scope.finish()
  }

  return scope.finish(
    ...buildRecordRemoveViewOps(scope.reader, recordIds),
    {
      type: 'document.record.remove',
      recordIds: [...recordIds]
    }
  )
}

const lowerRecordFieldsWriteMany = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'record.fields.writeMany' }>
): PlannedActionResult => {
  const recordIds = requireRecordIds(scope, action.input.recordIds, 'input.recordIds')
  const nextSet: Partial<Record<FieldId, unknown>> = {}
  const nextClear = new Set<FieldId>()

  Object.entries(action.input.set ?? {}).forEach(([fieldId, value], indexOfField) => {
    const typedFieldId = fieldId as FieldId
    if (!validateWritableField(scope, typedFieldId, `input.set.${indexOfField}`)) {
      return
    }

    if (value === undefined) {
      nextClear.add(typedFieldId)
      return
    }

    nextSet[typedFieldId] = value
  })

  ;(action.input.clear ?? []).forEach((fieldId, indexOfField) => {
    if (!validateWritableField(scope, fieldId, `input.clear.${indexOfField}`)) {
      return
    }

    nextClear.add(fieldId)
  })

  Object.keys(nextSet).forEach(fieldId => {
    if (!nextClear.has(fieldId)) {
      return
    }

    scope.issue(
      'record.fields.overlap',
      `record.fields.writeMany cannot set and clear the same field: ${fieldId}`,
      'input'
    )
  })

  if (!Object.keys(nextSet).length && !nextClear.size) {
    scope.issue(
      'record.fields.emptyWrite',
      'record.fields.writeMany requires at least one field write',
      'input'
    )
  }

  if (!recordIds) {
    return scope.finish()
  }

  return scope.finish({
    type: 'document.record.fields.writeMany',
    recordIds,
    ...(Object.keys(nextSet).length
      ? { set: nextSet }
      : {}),
    ...(nextClear.size
      ? { clear: Array.from(nextClear) }
      : {})
  })
}

export const planRecordAction = (
  scope: PlannerScope,
  action: Action
): PlannedActionResult => {
  switch (action.type) {
    case 'record.create':
      return lowerRecordCreate(scope, action)
    case 'record.patch':
      return lowerRecordPatch(scope, action)
    case 'record.remove':
      return lowerRecordRemove(scope, action)
    case 'record.fields.writeMany':
      return lowerRecordFieldsWriteMany(scope, action)
    default:
      throw new Error(`Unsupported record planner action: ${action.type}`)
  }
}
