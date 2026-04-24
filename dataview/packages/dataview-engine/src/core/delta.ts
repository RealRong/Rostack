import { impact as commitImpact } from '@dataview/core/commit/impact'
import { document as documentApi } from '@dataview/core/document'
import type {
  CommitImpact,
  DataDoc,
  FieldId,
  RecordId,
  ValueRef,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  DocDelta,
  KeyDelta,
  ListedDelta
} from '@dataview/engine/contracts/delta'

const readTouchedIds = <T,>(
  touched: ReadonlySet<T> | 'all',
  all: readonly T[]
): readonly T[] => touched === 'all'
  ? all
  : [...touched]

const buildListedDelta = <Key>(input: {
  previousIds: readonly Key[]
  nextIds: readonly Key[]
  touched?: readonly Key[]
  removed?: readonly Key[]
}): ListedDelta<Key> | undefined => {
  const removed = input.removed ?? []
  const removedSet = removed.length
    ? new Set(removed)
    : undefined
  const update = (input.touched ?? []).filter(key => !removedSet?.has(key))
  const ids = !equal.sameOrder(input.previousIds, input.nextIds)
    ? true as const
    : undefined

  return ids || update.length || removed.length
    ? {
        ...(ids
          ? { ids }
          : {}),
        ...(update.length
          ? { update }
          : {}),
        ...(removed.length
          ? { remove: removed }
          : {})
      }
    : undefined
}

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
}): KeyDelta<ValueRef> | undefined => {
  const changes = new Map<string, {
    ref: ValueRef
    kind: 'update' | 'remove'
  }>()
  const setChange = (
    ref: ValueRef,
    kind: 'update' | 'remove'
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
      setChange(ref, 'update')
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
          setChange(ref, 'update')
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

  const update: ValueRef[] = []
  const remove: ValueRef[] = []
  changes.forEach(change => {
    if (change.kind === 'update') {
      update.push(change.ref)
      return
    }

    remove.push(change.ref)
  })

  return update.length || remove.length
    ? {
        ...(update.length
          ? { update }
          : {}),
        ...(remove.length
          ? { remove }
          : {})
      }
    : undefined
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
  const nextFieldIds = documentApi.fields.custom.ids(input.next)
  const nextViewIds = documentApi.views.ids(input.next)
  const records = buildListedDelta<RecordId>({
    previousIds: documentApi.records.ids(input.previous),
    nextIds: nextRecordIds,
    touched: readTouchedIds(
      commitImpact.record.touchedIds(input.impact),
      nextRecordIds
    ) as readonly RecordId[],
    removed: [...(input.impact.records?.removed ?? [])]
  })
  const values = buildValueDelta(input)
  const fields = buildListedDelta<FieldId>({
    previousIds: documentApi.fields.custom.ids(input.previous),
    nextIds: nextFieldIds,
    touched: readTouchedIds(
      commitImpact.field.schemaIds(input.impact),
      nextFieldIds
    ) as readonly FieldId[],
    removed: [...(input.impact.fields?.removed ?? [])]
  })
  const views = buildListedDelta<ViewId>({
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

  return meta || records || values || fields || views
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
        ...(views
          ? { views }
          : {})
      }
    : undefined
}
