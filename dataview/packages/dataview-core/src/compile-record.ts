import type {
  DataRecord,
  FieldId,
  Intent,
  RecordId
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/op'
import { field as fieldApi } from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import { createId } from '@shared/core'
import {
  string
} from '@shared/core'
import type {
  DocumentReader
} from './document/reader'
import {
  issue,
  resolveTarget,
  type DataviewCompileInput
} from './compile-base'

const emitData = <T>(
  input: DataviewCompileInput,
  data: T,
  ...operations: readonly DocumentOperation[]
): T => {
  input.program.append(...operations)
  return data
}

const resolveDefaultRecordType = (
  reader: DocumentReader
) => reader.records.list().find(
  (record) => typeof record.type === 'string' && record.type.length
)?.type

const resolveRecordCreateValues = (
  reader: DocumentReader,
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
  input: DataviewCompileInput,
  reader: DocumentReader,
  recordIds: readonly string[],
  path: string
): readonly RecordId[] | undefined => {
  const nextRecordIds = Array.from(new Set(recordIds))
  if (!nextRecordIds.length) {
    issue(
      input,
      'batch.emptyCollection',
      `${input.source.type} requires at least one item`,
      path
    )
    return undefined
  }

  const resolved: RecordId[] = []
  nextRecordIds.forEach((recordId, index) => {
    if (!reader.records.has(recordId)) {
      issue(
        input,
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
  input: DataviewCompileInput,
  reader: DocumentReader,
  fieldId: string,
  path: string
): fieldId is FieldId => {
  if (!string.isNonEmptyString(fieldId)) {
    issue(
      input,
      'record.fields.invalidField',
      'record.fields.writeMany requires non-empty field ids',
      path
    )
    return false
  }

  if (fieldId !== TITLE_FIELD_ID && !reader.fields.has(fieldId)) {
    issue(
      input,
      'field.notFound',
      `Unknown field: ${fieldId}`,
      path
    )
    return false
  }

  return true
}

const lowerRecordCreate = (
  intent: Extract<Intent, { type: 'record.create' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const explicitRecordId = string.trimToUndefined(intent.input.id)

  if (intent.input.id !== undefined && !explicitRecordId) {
    issue(
      input,
      'record.invalidId',
      'Record id must be a non-empty string',
      'input.id'
    )
  }
  if (explicitRecordId && reader.records.has(explicitRecordId)) {
    issue(
      input,
      'record.duplicateId',
      `Record already exists: ${explicitRecordId}`,
      'input.id'
    )
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

  return emitData(
    input,
    {
      id: record.id
    },
    {
      type: 'record.create',
      value: record
    }
  )
}

const lowerRecordPatch = (
  intent: Extract<Intent, { type: 'record.patch' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const recordIds = resolveTarget(input, reader, intent.target)
  if (!recordIds) {
    return
  }

  if (!Object.keys(intent.patch).length) {
    issue(
      input,
      'record.emptyPatch',
      'record.patch patch cannot be empty',
      'patch'
    )
  }
  if (Object.prototype.hasOwnProperty.call(intent.patch, 'values')) {
    issue(
      input,
      'record.invalidPatch',
      'record.patch does not support values; use record.fields.writeMany',
      'patch.values'
    )
  }

  input.program.append(...recordIds.map((recordId): DocumentOperation => ({
    type: 'record.patch',
    id: recordId,
    patch: intent.patch
  })))
}

const lowerRecordRemove = (
  intent: Extract<Intent, { type: 'record.remove' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const recordIds = requireRecordIds(input, reader, intent.recordIds, 'recordIds')
  if (!recordIds) {
    return
  }

  input.program.append({
    type: 'record.remove',
    recordIds: [...recordIds]
  })
}

const lowerRecordFieldsWriteMany = (
  intent: Extract<Intent, { type: 'record.fields.writeMany' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
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

  Object.keys(nextSet).forEach((fieldId) => {
    if (!nextClear.has(fieldId)) {
      return
    }

    issue(
      input,
      'record.fields.overlap',
      `record.fields.writeMany cannot set and clear the same field: ${fieldId}`,
      'input'
    )
  })

  if (!Object.keys(nextSet).length && !nextClear.size) {
    issue(
      input,
      'record.fields.emptyWrite',
      'record.fields.writeMany requires at least one field write',
      'input'
    )
  }

  if (!recordIds) {
    return
  }

  input.program.append({
    type: 'record.values.writeMany',
    recordIds,
    ...(Object.keys(nextSet).length
      ? { set: nextSet }
      : {}),
    ...(nextClear.size
      ? { clear: Array.from(nextClear) }
      : {})
  })
}

export const compileRecordIntent = (
  intent: Intent,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
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
