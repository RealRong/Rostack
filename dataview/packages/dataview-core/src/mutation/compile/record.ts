import type {
  DataRecord,
  FieldId,
  Intent,
  RecordId
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import { field as fieldApi } from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import { createId, string } from '@shared/core'
import type {
  DataviewCompileContext
} from './contracts'
import {
  writeRecordValues,
  writeViewUpdate,
} from './helpers'
import {
  readViewOrderIds,
  replaceViewOrder
} from '../../view/order'

type RecordIntentType = Extract<Intent['type'], `record.${string}`>
type DataviewRecordIntentHandlers = {
  [K in RecordIntentType]: (
    input: DataviewCompileContext<Extract<Intent, { type: K }>>
  ) => void
}

const resolveDefaultRecordType = (
  input: DataviewCompileContext
) => input.query.records.list().find(
  (record) => typeof record.type === 'string' && record.type.length
)?.type

const resolveRecordCreateValues = (
  input: DataviewCompileContext,
  explicitValues: Extract<Intent, { type: 'record.create' }>['input']['values']
) => {
  const nextValues: Partial<Record<FieldId, unknown>> = {
    ...(explicitValues ?? {})
  }

  input.query.fields.list().forEach((field) => {
    if (!fieldApi.kind.isCustom(field)) {
      return
    }
    if (explicitValues && Object.prototype.hasOwnProperty.call(explicitValues, field.id)) {
      return
    }

    const defaultValue = fieldSpec.create.defaultValue(field)
    if (defaultValue === undefined) {
      return
    }

    nextValues[field.id] = defaultValue
  })

  return nextValues
}

const requireRecordIds = (
  input: DataviewCompileContext,
  recordIds: readonly string[],
  path: string
): readonly RecordId[] | undefined => {
  const nextRecordIds = Array.from(new Set(recordIds))
  if (!nextRecordIds.length) {
    input.issue({
      source: input.source,
      code: 'batch.emptyCollection',
      message: `${input.source.type} requires at least one item`,
      path,
      severity: 'error'
    })
    return undefined
  }

  const resolved: RecordId[] = []
  nextRecordIds.forEach((recordId, index) => {
    if (!input.query.records.has(recordId)) {
      input.issue({
        source: input.source,
        code: 'record.notFound',
        message: `Unknown record: ${recordId}`,
        path: `${path}.${index}`,
        severity: 'error'
      })
      return
    }

    resolved.push(recordId)
  })

  return resolved.length === nextRecordIds.length
    ? resolved
    : undefined
}

const validateWritableField = (
  input: DataviewCompileContext,
  fieldId: string,
  path: string
): fieldId is FieldId => {
  if (!string.isNonEmptyString(fieldId)) {
    input.issue({
      source: input.source,
      code: 'record.fields.invalidField',
      message: 'record.fields.writeMany requires non-empty field ids',
      path,
      severity: 'error'
    })
    return false
  }

  if (fieldId !== TITLE_FIELD_ID && !input.query.fields.has(fieldId)) {
    input.issue({
      source: input.source,
      code: 'field.notFound',
      message: `Unknown field: ${fieldId}`,
      path,
      severity: 'error'
    })
    return false
  }

  return true
}

const lowerRecordCreate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'record.create' }>>
) => {
  const { intent } = input
  const explicitRecordId = string.trimToUndefined(intent.input.id)

  if (intent.input.id !== undefined && !explicitRecordId) {
    input.issue({
      source: input.source,
      code: 'record.invalidId',
      message: 'Record id must be a non-empty string',
      path: 'input.id',
      severity: 'error'
    })
  }
  if (explicitRecordId && input.query.records.has(explicitRecordId)) {
    input.issue({
      source: input.source,
      code: 'record.duplicateId',
      message: `Record already exists: ${explicitRecordId}`,
      path: 'input.id',
      severity: 'error'
    })
  }
  if ((intent.input.id !== undefined && !explicitRecordId) || (explicitRecordId && input.query.records.has(explicitRecordId))) {
    return
  }

  const record = {
    id: explicitRecordId || createId('record'),
    title: string.trimToUndefined(intent.input.title) ?? '',
    type: intent.input.type ?? resolveDefaultRecordType(input),
    values: resolveRecordCreateValues(input, intent.input.values),
    meta: intent.input.meta
  } satisfies DataRecord

  input.writer.record.create(record)
  input.output({
    id: record.id
  })
}

const lowerRecordRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'record.remove' }>>
) => {
  const { intent } = input
  const recordIds = requireRecordIds(input, intent.recordIds, 'recordIds')
  if (!recordIds) {
    return
  }

  const removedRecordIds = new Set(recordIds)
  input.query.views.list().forEach((view) => {
    const currentOrder = readViewOrderIds(view)
    const nextOrders = currentOrder.filter((recordId) => !removedRecordIds.has(recordId))
    if (nextOrders.length === currentOrder.length) {
      return
    }

    writeViewUpdate(input.writer, view, {
      ...view,
      order: replaceViewOrder(nextOrders)
    })
  })

  recordIds.forEach((recordId) => {
    input.writer.record.delete(recordId)
  })
}

const lowerRecordFieldsWriteMany = (
  input: DataviewCompileContext<Extract<Intent, { type: 'record.fields.writeMany' }>>
) => {
  const { intent } = input
  const recordIds = requireRecordIds(input, intent.recordIds, 'recordIds')
  const nextSet: Partial<Record<FieldId, unknown>> = {}
  const nextClear = new Set<FieldId>()

  Object.entries(intent.set ?? {}).forEach(([fieldId, value], indexOfField) => {
    if (!validateWritableField(input, fieldId, `set.${indexOfField}`)) {
      return
    }

    if (value === undefined) {
      nextClear.add(fieldId)
      return
    }

    nextSet[fieldId] = value
  })

  ;(intent.clear ?? []).forEach((fieldId, indexOfField) => {
    if (!validateWritableField(input, fieldId, `clear.${indexOfField}`)) {
      return
    }

    nextClear.add(fieldId)
  })

  if (!recordIds) {
    return
  }

  if (!Object.keys(nextSet).length && nextClear.size === 0) {
    input.issue({
      source: input.source,
      code: 'record.fields.emptyWrite',
      message: 'record.fields.writeMany requires at least one set or clear entry',
      severity: 'error'
    })
    return
  }

  writeRecordValues(input.writer, recordIds, {
    ...(Object.keys(nextSet).length
      ? {
          set: nextSet
        }
      : {}),
    ...(nextClear.size
      ? {
          clear: [...nextClear]
        }
      : {})
  })
}

export const dataviewRecordIntentHandlers: DataviewRecordIntentHandlers = {
  'record.create': lowerRecordCreate,
  'record.remove': lowerRecordRemove,
  'record.fields.writeMany': lowerRecordFieldsWriteMany
}
