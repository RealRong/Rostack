import type {
  DataRecord,
  FieldId,
  Intent,
  RecordId,
  View
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import { field as fieldApi } from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import { createId } from '@shared/core'
import {
  collection,
  string
} from '@shared/core'
import type {
  CompileScope
} from './scope'

const emitOps = (
  scope: CompileScope,
  ...operations: readonly DocumentOperation[]
) => {
  scope.emitMany(...operations)
}

const emitData = <T>(
  scope: CompileScope,
  data: T,
  ...operations: readonly DocumentOperation[]
): T => {
  emitOps(scope, ...operations)
  return data
}

const toViewPut = (
  view: View
): DocumentOperation => ({
  type: 'document.view.put',
  view
})

const buildRecordRemoveViewOps = (
  reader: CompileScope['reader'],
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
  reader: CompileScope['reader']
) => reader.records.list().find(record => typeof record.type === 'string' && record.type.length)?.type

const resolveRecordCreateValues = (
  reader: CompileScope['reader'],
  explicitValues: Extract<Intent, { type: 'record.create' }>['input']['values']
) => {
  const nextValues = {
    ...(explicitValues ?? {})
  }

  reader.fields.list().forEach(field => {
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
  scope: CompileScope,
  recordIds: readonly string[],
  path: string
): readonly RecordId[] | undefined => {
  const nextRecordIds = collection.unique(recordIds) as RecordId[]
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
  scope: CompileScope,
  fieldId: FieldId,
  path: string
): boolean => {
  if (!string.isNonEmptyString(fieldId)) {
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
  scope: CompileScope,
  intent: Extract<Intent, { type: 'record.create' }>
) => {
  const explicitRecordId = string.trimToUndefined(intent.input.id)

  if (intent.input.id !== undefined && !explicitRecordId) {
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
  if ((intent.input.id !== undefined && !explicitRecordId) || (explicitRecordId && scope.reader.records.has(explicitRecordId))) {
    return
  }

  const record = {
    id: explicitRecordId || createId('record'),
    title: string.trimToUndefined(intent.input.title) ?? '',
    type: intent.input.type ?? resolveDefaultRecordType(scope.reader),
    values: resolveRecordCreateValues(scope.reader, intent.input.values),
    meta: intent.input.meta
  } satisfies DataRecord

  return emitData(
    scope,
    {
      id: record.id
    },
    {
      type: 'document.record.insert',
      records: [record]
    }
  )
}

const lowerRecordPatch = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'record.patch' }>
)=> {
  const recordIds = scope.resolveTarget(intent.target)
  if (!recordIds) {
    return
  }

  if (!Object.keys(intent.patch).length) {
    scope.issue(
      'record.emptyPatch',
      'record.patch patch cannot be empty',
      'patch'
    )
  }
  if (Object.prototype.hasOwnProperty.call(intent.patch, 'values')) {
    scope.issue(
      'record.invalidPatch',
      'record.patch does not support values; use record.fields.writeMany',
      'patch.values'
    )
  }

  emitOps(scope, ...recordIds.map((recordId): DocumentOperation => ({
    type: 'document.record.patch',
    recordId,
    patch: intent.patch
  })))
}

const lowerRecordRemove = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'record.remove' }>
)=> {
  const recordIds = requireRecordIds(scope, intent.recordIds, 'recordIds')
  if (!recordIds) {
    return
  }

  emitOps(
    scope,
    ...buildRecordRemoveViewOps(scope.reader, recordIds),
    {
      type: 'document.record.remove',
      recordIds: [...recordIds]
    }
  )
}

const lowerRecordFieldsWriteMany = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'record.fields.writeMany' }>
)=> {
  const recordIds = requireRecordIds(scope, intent.recordIds, 'recordIds')
  const nextSet: Partial<Record<FieldId, unknown>> = {}
  const nextClear = new Set<FieldId>()

  Object.entries(intent.set ?? {}).forEach(([fieldId, value], indexOfField) => {
    const typedFieldId = fieldId as FieldId
    if (!validateWritableField(scope, typedFieldId, `set.${indexOfField}`)) {
      return
    }

    if (value === undefined) {
      nextClear.add(typedFieldId)
      return
    }

    nextSet[typedFieldId] = value
  })

  ;(intent.clear ?? []).forEach((fieldId, indexOfField) => {
    if (!validateWritableField(scope, fieldId, `clear.${indexOfField}`)) {
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
    return
  }

  scope.emit({
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

export const compileRecordIntent = (
  intent: Intent,
  scope: CompileScope
) => {
  switch (intent.type) {
    case 'record.create':
      return lowerRecordCreate(scope, intent)
    case 'record.patch':
      return lowerRecordPatch(scope, intent)
    case 'record.remove':
      return lowerRecordRemove(scope, intent)
    case 'record.fields.writeMany':
      return lowerRecordFieldsWriteMany(scope, intent)
    default:
      throw new Error(`Unsupported record intent: ${intent.type}`)
  }
}
