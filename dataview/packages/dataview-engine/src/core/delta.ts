import { impact as commitImpact } from '@dataview/core/commit/impact'
import { document as documentApi } from '@dataview/core/document'
import type {
  CommitImpact,
  CustomFieldId,
  DataDoc,
  FieldId,
  RecordId,
  ValueRef,
  ViewId
} from '@dataview/core/contracts'
import {
  entityDelta,
  equal,
  type EntityDelta
} from '@shared/core'
import type {
  DocDelta
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
  const record = documentApi.records.get(document, recordId)
  return record
    ? documentApi.values.fieldIds(record).map(fieldId => ({
        recordId,
        fieldId
      }))
    : []
}

const collectAllValueRefs = (
  document: DataDoc
): readonly ValueRef[] => documentApi.records.ids(document).flatMap(recordId => (
  collectRecordValueRefs(document, recordId)
))

const buildValueDelta = (input: {
  previous: DataDoc
  next: DataDoc
  impact: CommitImpact
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

  const touched = commitImpact.value.touched(input.impact)
  if (touched === 'all') {
    const nextRefs = collectAllValueRefs(input.next)
    const nextRefKeySet = new Set(nextRefs.map(valueRefKey))

    nextRefs.forEach(ref => {
      setChange(ref, 'set')
    })
    collectAllValueRefs(input.previous).forEach(ref => {
      if (!nextRefKeySet.has(valueRefKey(ref))) {
        setChange(ref, 'remove')
      }
    })
  } else {
    touched?.forEach((fieldIds, recordId) => {
      fieldIds.forEach(fieldId => {
        const ref: ValueRef = {
          recordId,
          fieldId
        }
        const nextRecord = documentApi.records.get(input.next, recordId)
        const previousRecord = documentApi.records.get(input.previous, recordId)
        const nextValue = nextRecord
          ? documentApi.values.get(nextRecord, fieldId)
          : undefined
        const previousValue = previousRecord
          ? documentApi.values.get(previousRecord, fieldId)
          : undefined

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

  input.impact.records?.removed?.forEach(recordId => {
    collectRecordValueRefs(input.previous, recordId).forEach(ref => {
      setChange(ref, 'remove')
    })
  })
  input.impact.fields?.removed?.forEach(fieldId => {
    documentApi.records.ids(input.previous).forEach(recordId => {
      const record = documentApi.records.get(input.previous, recordId)
      if (!record) {
        return
      }

      if (documentApi.values.get(record, fieldId) === undefined) {
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
  changes.forEach(change => {
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
  impact: CommitImpact
}): DocDelta | undefined => {
  if (input.impact.reset) {
    return {
      reset: true
    }
  }

  const nextRecordIds = documentApi.records.ids(input.next)
  const nextFieldIds = documentApi.fields.ids(input.next)
  const nextSchemaFieldIds = documentApi.schema.fields.ids(input.next)
  const nextViewIds = documentApi.views.ids(input.next)
  const records = buildEntityDelta<RecordId>({
    previousIds: documentApi.records.ids(input.previous),
    nextIds: nextRecordIds,
    touched: readTouchedIds(
      commitImpact.record.touchedIds(input.impact),
      nextRecordIds
    ) as readonly RecordId[],
    removed: [...(input.impact.records?.removed ?? [])]
  })
  const values = buildValueDelta(input)
  const fields = buildEntityDelta<FieldId>({
    previousIds: documentApi.fields.ids(input.previous),
    nextIds: nextFieldIds,
    touched: readTouchedIds(
      commitImpact.field.schemaIds(input.impact),
      nextFieldIds
    ) as readonly FieldId[],
    removed: [...(input.impact.fields?.removed ?? [])]
  })
  const schemaFields = buildEntityDelta<CustomFieldId>({
    previousIds: documentApi.schema.fields.ids(input.previous),
    nextIds: nextSchemaFieldIds,
    touched: readTouchedIds(
      commitImpact.field.schemaIds(input.impact),
      nextSchemaFieldIds
    ) as readonly CustomFieldId[],
    removed: [...(input.impact.fields?.removed ?? [])]
  })
  const views = buildEntityDelta<ViewId>({
    previousIds: documentApi.views.ids(input.previous),
    nextIds: nextViewIds,
    touched: readTouchedIds(
      commitImpact.view.touchedIds(input.impact),
      nextViewIds
    ) as readonly ViewId[],
    removed: [...(input.impact.views?.removed ?? [])]
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
          ? {
              schema: {
                fields: schemaFields
              }
            }
          : {}),
        ...(views
          ? { views }
          : {})
      }
    : undefined
}
