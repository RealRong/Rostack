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
  DataviewCompileReader
} from './reader'
import type {
  DataviewCompileContext
} from './contracts'
import {
  writeViewUpdate
} from './viewDiff'

const resolveDefaultRecordType = (
  reader: DataviewCompileReader
) => reader.records.list().find(
  (record) => typeof record.type === 'string' && record.type.length
)?.type

const resolveRecordCreateValues = (
  reader: DataviewCompileReader,
  explicitValues: Extract<Intent, { type: 'record.create' }>['input']['values']
) => {
  const nextValues: Partial<Record<FieldId, unknown>> = {
    ...(explicitValues ?? {})
  }

  reader.fields.list().forEach((field) => {
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
  reader: DataviewCompileReader,
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
    if (!reader.records.has(recordId)) {
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
  reader: DataviewCompileReader,
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

  if (fieldId !== TITLE_FIELD_ID && !reader.fields.has(fieldId)) {
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
  intent: Extract<Intent, { type: 'record.create' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
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
  if (explicitRecordId && reader.records.has(explicitRecordId)) {
    input.issue({
      source: input.source,
      code: 'record.duplicateId',
      message: `Record already exists: ${explicitRecordId}`,
      path: 'input.id',
      severity: 'error'
    })
  }
  if ((intent.input.id !== undefined && !explicitRecordId) || (explicitRecordId && reader.records.has(explicitRecordId))) {
    return
  }

  const record = {
    id: explicitRecordId || createId('record'),
    title: string.trimToUndefined(intent.input.title) ?? '',
    type: intent.input.type ?? resolveDefaultRecordType(reader),
    values: resolveRecordCreateValues(reader, intent.input.values),
    meta: intent.input.meta
  } satisfies DataRecord

  input.program.record.create(record)
  input.output({
    id: record.id
  })
}

const lowerRecordPatch = (
  intent: Extract<Intent, { type: 'record.patch' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const recordIds = reader.records.require(intent.target)
  if (!recordIds) {
    return
  }

  if (!Object.keys(intent.patch).length) {
    input.issue({
      source: input.source,
      code: 'record.emptyPatch',
      message: 'record.patch patch cannot be empty',
      path: 'patch',
      severity: 'error'
    })
  }
  if (Object.prototype.hasOwnProperty.call(intent.patch, 'values')) {
    input.issue({
      source: input.source,
      code: 'record.invalidPatch',
      message: 'record.patch does not support values; use record.fields.writeMany',
      path: 'patch.values',
      severity: 'error'
    })
  }

  recordIds.forEach((recordId) => {
    input.program.record.patch(recordId, intent.patch)
  })
}

const lowerRecordRemove = (
  intent: Extract<Intent, { type: 'record.remove' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const recordIds = requireRecordIds(input, reader, intent.recordIds, 'recordIds')
  if (!recordIds) {
    return
  }

  const removedRecordIds = new Set(recordIds)
  reader.views.list().forEach((view) => {
    const nextOrders = view.orders.filter((recordId) => !removedRecordIds.has(recordId))
    if (nextOrders.length === view.orders.length) {
      return
    }

    writeViewUpdate(input.program, view, {
      ...view,
      orders: nextOrders
    })
  })

  recordIds.forEach((recordId) => {
    input.program.record.delete(recordId)
  })
}

const lowerRecordFieldsWriteMany = (
  intent: Extract<Intent, { type: 'record.fields.writeMany' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const recordIds = requireRecordIds(input, reader, intent.recordIds, 'recordIds')
  const nextSet: Partial<Record<FieldId, unknown>> = {}
  const nextClear = new Set<FieldId>()

  Object.entries(intent.set ?? {}).forEach(([fieldId, value], indexOfField) => {
    if (!validateWritableField(input, reader, fieldId, `set.${indexOfField}`)) {
      return
    }

    if (value === undefined) {
      nextClear.add(fieldId)
      return
    }

    nextSet[fieldId] = value
  })

  ;(intent.clear ?? []).forEach((fieldId, indexOfField) => {
    if (!validateWritableField(input, reader, fieldId, `clear.${indexOfField}`)) {
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

  input.program.record.writeValuesMany({
    recordIds,
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

export const compileRecordIntent = (
  input: DataviewCompileContext
) => {
  const { intent, reader } = input
  switch (intent.type) {
    case 'record.create':
      return lowerRecordCreate(intent, input, reader)
    case 'record.patch':
      return lowerRecordPatch(intent, input, reader)
    case 'record.remove':
      return lowerRecordRemove(intent, input, reader)
    case 'record.fields.writeMany':
      return lowerRecordFieldsWriteMany(intent, input, reader)
    default:
      throw new Error(`Unsupported record intent: ${intent.type}`)
  }
}
