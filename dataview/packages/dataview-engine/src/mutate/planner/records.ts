import type {
  Action,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
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
} from '@dataview/engine/mutate/issues'
import { createRecordId } from '@dataview/engine/mutate/entityId'
import { validateFieldExists } from '@dataview/engine/mutate/validate/entity'
import {
  validateEditTarget,
  validateRecordIdsExist,
  validateRequiredCollection
} from '@dataview/engine/mutate/validate/target'
import {
  listTargetRecordIds,
  planResult,
  sourceOf,
  toViewPut,
  type PlannedActionResult
} from '@dataview/engine/mutate/planner/shared'

const buildRecordRemoveViewOps = (
  document: DataDoc,
  recordIds: readonly RecordId[]
): DocumentOperation[] => {
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
  const issues = validateEditTarget(document, source, action.target)

  if (!Object.keys(action.patch).length) {
    issues.push(createIssue(source, 'error', 'record.emptyPatch', 'record.patch patch cannot be empty', 'patch'))
  }
  if (Object.prototype.hasOwnProperty.call(action.patch, 'values')) {
    issues.push(createIssue(
      source,
      'error',
      'record.invalidPatch',
      'record.patch does not support values; use record.fields.writeMany',
      'patch.values'
    ))
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
  const issues = [
    ...validateRequiredCollection(source, action.recordIds, 'recordIds'),
    ...validateRecordIdsExist(document, source, action.recordIds, 'recordIds')
  ]
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

const validateWritableField = (
  document: DataDoc,
  source: ReturnType<typeof sourceOf>,
  fieldId: FieldId,
  path: string
) => {
  const issues: ReturnType<typeof validateFieldExists> = []

  if (!isNonEmptyString(fieldId)) {
    issues.push(createIssue(
      source,
      'error',
      'record.fields.invalidField',
      'record.fields.writeMany requires non-empty field ids',
      path
    ))
    return issues
  }

  if (fieldId !== TITLE_FIELD_ID) {
    issues.push(...validateFieldExists(document, source, fieldId, path))
  }

  return issues
}

const lowerRecordFieldsWriteMany = (
  document: DataDoc,
  action: Extract<Action, { type: 'record.fields.writeMany' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const recordIds = [...new Set(action.input.recordIds)]
  const issues = [
    ...validateRequiredCollection(source, recordIds, 'input.recordIds'),
    ...validateRecordIdsExist(document, source, recordIds, 'input.recordIds')
  ]

  const nextSet: Partial<Record<FieldId, unknown>> = {}
  const nextClear = new Set<FieldId>()

  Object.entries(action.input.set ?? {}).forEach(([fieldId, value], indexOfField) => {
    const typedFieldId = fieldId as FieldId
    issues.push(...validateWritableField(document, source, typedFieldId, `input.set.${indexOfField}`))
    if (value === undefined) {
      nextClear.add(typedFieldId)
      return
    }

    nextSet[typedFieldId] = value
  })

  ;(action.input.clear ?? []).forEach((fieldId, indexOfField) => {
    issues.push(...validateWritableField(document, source, fieldId, `input.clear.${indexOfField}`))
    nextClear.add(fieldId)
  })

  Object.keys(nextSet).forEach(fieldId => {
    if (!nextClear.has(fieldId)) {
      return
    }

    issues.push(createIssue(
      source,
      'error',
      'record.fields.overlap',
      `record.fields.writeMany cannot set and clear the same field: ${fieldId}`,
      'input'
    ))
  })

  if (!Object.keys(nextSet).length && !nextClear.size) {
    issues.push(createIssue(
      source,
      'error',
      'record.fields.emptyWrite',
      'record.fields.writeMany requires at least one field write',
      'input'
    ))
  }

  return planResult(
    issues,
    [{
      type: 'document.record.fields.writeMany',
      recordIds,
      ...(Object.keys(nextSet).length
        ? { set: nextSet }
        : {}),
      ...(nextClear.size
        ? { clear: Array.from(nextClear) }
        : {})
    }]
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
    case 'record.fields.writeMany':
      return lowerRecordFieldsWriteMany(document, action, index)
    default:
      throw new Error(`Unsupported record planner action: ${action.type}`)
  }
}
