import type {
  Action,
  DataDoc,
  DataRecord,
  RecordId
} from '@dataview/core/contracts'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import {
  getDocumentCustomFields,
  getDocumentRecordById,
  getDocumentRecords,
  getDocumentViews,
  normalizeViewOrders
} from '@dataview/core/document'
import { getStatusFieldDefaultOption } from '@dataview/core/field'
import {
  isNonEmptyString,
  trimToUndefined
} from '@shared/core'
import {
  createIssue,
  hasValidationErrors
} from '#engine/mutate/issues.ts'
import { createRecordId } from '#engine/mutate/entityId.ts'
import { validateFieldExists } from '#engine/mutate/validate/entity.ts'
import {
  listTargetRecordIds,
  planResult,
  sourceOf,
  toViewPut,
  validateBatchItems,
  validateTarget,
  type PlannedActionResult
} from '#engine/mutate/planner/shared.ts'

const buildRecordRemoveViewOps = (
  document: DataDoc,
  recordIds: readonly RecordId[]
): BaseOperation[] => {
  const removedRecordIdSet = new Set(recordIds)
  return getDocumentViews(document).flatMap(view => {
    const nextOrders = normalizeViewOrders(document, view.orders.filter(recordId => !removedRecordIdSet.has(recordId)))
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
  document: DataDoc
) => getDocumentRecords(document).find(record => typeof record.type === 'string' && record.type.length)?.type

const resolveRecordCreateValues = (
  document: DataDoc,
  explicitValues: Extract<Action, { type: 'record.create' }>['input']['values']
) => {
  const nextValues = {
    ...(explicitValues ?? {})
  }

  getDocumentCustomFields(document).forEach(field => {
    if (field.kind !== 'status') {
      return
    }
    if (explicitValues && Object.prototype.hasOwnProperty.call(explicitValues, field.id)) {
      return
    }
    const defaultOption = getStatusFieldDefaultOption(field)
    if (!defaultOption) {
      return
    }
    nextValues[field.id] = defaultOption.id
  })

  return nextValues
}

const lowerRecordCreate = (
  document: DataDoc,
  action: Extract<Action, { type: 'record.create' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const explicitRecordId = trimToUndefined(action.input.id)
  const issues = [
    ...(action.input.id !== undefined && !explicitRecordId
      ? [createIssue(source, 'error', 'record.invalidId', 'Record id must be a non-empty string', 'input.id')]
      : []),
    ...(explicitRecordId && getDocumentRecordById(document, explicitRecordId)
      ? [createIssue(source, 'error', 'record.duplicateId', `Record already exists: ${explicitRecordId}`, 'input.id')]
      : [])
  ]

  if (hasValidationErrors(issues)) {
    return planResult(issues)
  }

  const record = {
    id: explicitRecordId || createRecordId(),
    title: trimToUndefined(action.input.title) ?? '',
    type: action.input.type ?? resolveDefaultRecordType(document),
    values: resolveRecordCreateValues(document, action.input.values),
    meta: action.input.meta
  } satisfies DataRecord

  return planResult(issues, [{
    type: 'document.record.insert',
    records: [record]
  }])
}

const lowerRecordPatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'record.patch' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateTarget(document, source, action.target)

  if (!Object.keys(action.patch).length) {
    issues.push(createIssue(source, 'error', 'record.emptyPatch', 'record.patch patch cannot be empty', 'patch'))
  }
  if (action.patch.values && typeof action.patch.values !== 'object') {
    issues.push(createIssue(source, 'error', 'record.emptyPatch', 'record.patch values patch must be an object', 'patch.values'))
  }

  return planResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'document.record.patch',
      recordId,
      patch: action.patch
    }))
  )
}

const lowerRecordRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'record.remove' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateBatchItems(source, action.recordIds, 'recordIds')
  action.recordIds.forEach((recordId, itemIndex) => {
    if (!getDocumentRecordById(document, recordId)) {
      issues.push(createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, `recordIds.${itemIndex}`))
    }
  })
  return planResult(
    issues,
    [
      ...buildRecordRemoveViewOps(document, action.recordIds),
      {
        type: 'document.record.remove',
        recordIds: action.recordIds
      }
    ]
  )
}

const lowerValueSet = (
  document: DataDoc,
  action: Extract<Action, { type: 'value.set' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = [
    ...validateTarget(document, source, action.target),
    ...validateFieldExists(document, source, action.field, 'field')
  ]
  if (!isNonEmptyString(action.field)) {
    issues.push(createIssue(source, 'error', 'value.invalidField', 'value.set requires a non-empty field', 'field'))
  }
  return planResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'document.value.set',
      recordId,
      field: action.field,
      value: action.value
    }))
  )
}

const lowerValuePatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'value.patch' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateTarget(document, source, action.target)
  if (!Object.keys(action.patch).length) {
    issues.push(createIssue(source, 'error', 'value.emptyPatch', 'value.patch patch cannot be empty', 'patch'))
  }
  return planResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'document.value.patch',
      recordId,
      patch: action.patch
    }))
  )
}

const lowerValueClear = (
  document: DataDoc,
  action: Extract<Action, { type: 'value.clear' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = [
    ...validateTarget(document, source, action.target),
    ...validateFieldExists(document, source, action.field, 'field')
  ]
  if (!isNonEmptyString(action.field)) {
    issues.push(createIssue(source, 'error', 'value.invalidField', 'value.clear requires a non-empty field', 'field'))
  }
  return planResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'document.value.clear',
      recordId,
      field: action.field
    }))
  )
}

export const planRecordAction = (
  document: DataDoc,
  action: Action,
  index: number
): PlannedActionResult => {
  switch (action.type) {
    case 'record.create':
      return lowerRecordCreate(document, action, index)
    case 'record.patch':
      return lowerRecordPatch(document, action, index)
    case 'record.remove':
      return lowerRecordRemove(document, action, index)
    case 'value.set':
      return lowerValueSet(document, action, index)
    case 'value.patch':
      return lowerValuePatch(document, action, index)
    case 'value.clear':
      return lowerValueClear(document, action, index)
    default:
      throw new Error(`Unsupported record planner action: ${action.type}`)
  }
}
