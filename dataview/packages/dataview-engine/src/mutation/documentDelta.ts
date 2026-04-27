import { field as fieldApi } from '@dataview/core/field'
import type {
  CustomFieldId,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId,
  ValueRef,
  ViewId
} from '@dataview/core/types'
import type {
  DataviewTrace
} from '@dataview/core/operations'
import {
  dataviewTrace
} from '@dataview/core/operations'
import {
  entityDelta,
  type EntityDelta
} from '@shared/delta'
import { equal } from '@shared/core'
import type {
  DocumentDelta
} from '@dataview/engine/contracts/delta'

const readTouchedIds = <T,>(
  touched: ReadonlySet<T> | 'all',
  all: readonly T[]
): readonly T[] => touched === 'all'
  ? all
  : [...touched]

const buildEntityDelta = <Key>(input: {
  previousIds: readonly Key[]
  nextIds: readonly Key[]
  touched?: readonly Key[]
  removed?: readonly Key[]
}): EntityDelta<Key> | undefined => entityDelta.normalize({
  ...(equal.sameOrder(input.previousIds, input.nextIds)
    ? {}
    : {
        order: true as const
      }),
  set: input.touched,
  remove: input.removed
})

const valueRefKey = (
  ref: ValueRef
): string => `${ref.recordId}\u0000${ref.fieldId}`

const collectRecordValueRefs = (
  document: DataDoc,
  recordId: RecordId
): readonly ValueRef[] => {
  const record = document.records.byId[recordId]
  return record
    ? fieldApi.value.read(record, 'title') !== undefined
      ? ['title' as FieldId, ...Object.keys(record.values) as FieldId[]].map(fieldId => ({
          recordId,
          fieldId
        }))
      : []
    : []
}

const readValue = (
  record: DataRecord | undefined,
  fieldId: FieldId
): unknown | undefined => record
  ? fieldApi.value.read(record, fieldId)
  : undefined

const collectAllValueRefs = (
  document: DataDoc
): readonly ValueRef[] => document.records.order.flatMap((recordId) => (
  collectRecordValueRefs(document, recordId)
))

const readFieldIds = (
  document: DataDoc
): readonly FieldId[] => ['title', ...document.fields.order]

const readSchemaFieldIds = (
  document: DataDoc
): readonly CustomFieldId[] => document.fields.order

const readViewIds = (
  document: DataDoc
): readonly ViewId[] => document.views.order

const buildValueDelta = (input: {
  previous: DataDoc
  next: DataDoc
  trace: DataviewTrace
}): EntityDelta<ValueRef> | undefined => {
  const changes = new Map<string, {
    ref: ValueRef
    kind: 'set' | 'remove'
  }>()
  const setChange = (
    ref: ValueRef,
    kind: 'set' | 'remove'
  ) => {
    changes.set(valueRefKey(ref), {
      ref,
      kind
    })
  }

  const touched = dataviewTrace.value.touched(input.trace)
  if (touched === 'all') {
    const nextRefs = collectAllValueRefs(input.next)
    const nextRefKeySet = new Set(nextRefs.map(valueRefKey))

    nextRefs.forEach((ref) => {
      setChange(ref, 'set')
    })
    collectAllValueRefs(input.previous).forEach((ref) => {
      if (!nextRefKeySet.has(valueRefKey(ref))) {
        setChange(ref, 'remove')
      }
    })
  } else {
    touched?.forEach((fieldIds, recordId) => {
      fieldIds.forEach((fieldId: FieldId) => {
        const ref: ValueRef = {
          recordId,
          fieldId
        }
        const nextRecord = input.next.records.byId[recordId]
        const previousRecord = input.previous.records.byId[recordId]
        const nextValue = readValue(nextRecord, fieldId)
        const previousValue = readValue(previousRecord, fieldId)

        if (nextValue !== undefined) {
          setChange(ref, 'set')
          return
        }

        if (previousValue !== undefined) {
          setChange(ref, 'remove')
        }
      })
    })
  }

  input.trace.records?.removed?.forEach((recordId) => {
    collectRecordValueRefs(input.previous, recordId).forEach((ref) => {
      setChange(ref, 'remove')
    })
  })
  input.trace.fields?.removed?.forEach((fieldId) => {
    input.previous.records.order.forEach((recordId: RecordId) => {
      const record = input.previous.records.byId[recordId]
      if (!record) {
        return
      }

      if (readValue(record, fieldId) === undefined) {
        return
      }

      setChange({
        recordId,
        fieldId
      }, 'remove')
    })
  })

  if (!changes.size) {
    return undefined
  }

  const set: ValueRef[] = []
  const remove: ValueRef[] = []
  changes.forEach((change) => {
    if (change.kind === 'set') {
      set.push(change.ref)
      return
    }

    remove.push(change.ref)
  })

  return entityDelta.normalize({
    set,
    remove
  })
}

export const projectDocumentDelta = (input: {
  previous: DataDoc
  next: DataDoc
  trace: DataviewTrace
}): DocumentDelta | undefined => {
  if (input.trace.reset) {
    return {
      reset: true
    }
  }

  const nextRecordIds = input.next.records.order
  const nextFieldIds = readFieldIds(input.next)
  const nextSchemaFieldIds = readSchemaFieldIds(input.next)
  const nextViewIds = readViewIds(input.next)
  const records = buildEntityDelta<RecordId>({
    previousIds: input.previous.records.order,
    nextIds: nextRecordIds,
    touched: readTouchedIds(
      dataviewTrace.record.touchedIds(input.trace),
      nextRecordIds
    ) as readonly RecordId[],
    removed: [...(input.trace.records?.removed ?? [])]
  })
  const values = buildValueDelta(input)
  const fields = buildEntityDelta<FieldId>({
    previousIds: readFieldIds(input.previous),
    nextIds: nextFieldIds,
    touched: readTouchedIds(
      dataviewTrace.field.touchedIds(input.trace),
      nextFieldIds
    ) as readonly FieldId[],
    removed: [...(input.trace.fields?.removed ?? [])]
  })
  const schemaFields = buildEntityDelta<CustomFieldId>({
    previousIds: readSchemaFieldIds(input.previous),
    nextIds: nextSchemaFieldIds,
    touched: readTouchedIds(
      dataviewTrace.field.schemaIds(input.trace),
      nextSchemaFieldIds
    ) as readonly CustomFieldId[],
    removed: [...(input.trace.fields?.removed ?? [])]
  })
  const views = buildEntityDelta<ViewId>({
    previousIds: readViewIds(input.previous),
    nextIds: nextViewIds,
    touched: readTouchedIds(
      dataviewTrace.view.touchedIds(input.trace),
      nextViewIds
    ) as readonly ViewId[],
    removed: [...(input.trace.views?.removed ?? [])]
  })
  const meta = !equal.sameJsonValue(input.previous.meta, input.next.meta)
    ? true
    : undefined

  return meta || records || values || fields || schemaFields || views
    ? {
        ...(meta
          ? { meta }
          : {}),
        ...(records
          ? { records }
          : {}),
        ...(values
          ? { values }
          : {}),
        ...(fields
          ? { fields }
          : {}),
        ...(schemaFields
          ? { schemaFields }
          : {}),
        ...(views
          ? { views }
          : {})
      }
    : undefined
}
