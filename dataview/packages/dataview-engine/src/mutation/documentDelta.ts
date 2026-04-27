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
import { equal } from '@shared/core'
import {
  documentChange,
  type DocumentDelta
} from '@dataview/engine/contracts/delta'

const encodeValueRef = (
  ref: ValueRef
): string => `${ref.recordId}\u0000${ref.fieldId}`

type DocumentChangeKey =
  | 'records'
  | 'values'
  | 'fields'
  | 'schemaFields'
  | 'views'

type DocumentChangeIdByKey = {
  records: RecordId
  values: ValueRef
  fields: FieldId
  schemaFields: CustomFieldId
  views: ViewId
}

type DocumentIdChangeInput = {
  [TKey in DocumentChangeKey]: {
    key: TKey
    previousIds: readonly DocumentChangeIdByKey[TKey][]
    nextIds: readonly DocumentChangeIdByKey[TKey][]
    touchedIds?: readonly DocumentChangeIdByKey[TKey][]
    removedIds?: readonly DocumentChangeIdByKey[TKey][]
  }
}[DocumentChangeKey]

const readValue = (
  record: DataRecord | undefined,
  fieldId: FieldId
): unknown | undefined => record
  ? fieldApi.value.read(record, fieldId)
  : undefined

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

const collectAllValueRefs = (
  document: DataDoc
): readonly ValueRef[] => document.records.ids.flatMap((recordId) => (
  collectRecordValueRefs(document, recordId)
))

const readFieldIds = (
  document: DataDoc
): readonly FieldId[] => ['title', ...document.fields.ids]

const readSchemaFieldIds = (
  document: DataDoc
): readonly CustomFieldId[] => document.fields.ids

const readViewIds = (
  document: DataDoc
): readonly ViewId[] => document.views.ids

const toTouchedIds = <TId,>(
  touched: ReadonlySet<TId> | 'all',
  all: readonly TId[]
): readonly TId[] => touched === 'all'
  ? all
  : [...touched]

const planIdChanges = <TId,>(input: {
  previousIds: readonly TId[]
  nextIds: readonly TId[]
  touchedIds?: readonly TId[]
  removedIds?: readonly TId[]
}) => {
  const previousSet = new Set(input.previousIds)
  const nextSet = new Set(input.nextIds)
  const orderChanged = !equal.sameOrder(input.previousIds, input.nextIds)
  const touchedSet = new Set(input.touchedIds ?? [])
  const add: TId[] = []
  const update: TId[] = []
  const remove: TId[] = []

  input.nextIds.forEach(id => {
    if (!previousSet.has(id)) {
      add.push(id)
      return
    }

    if (orderChanged || touchedSet.has(id)) {
      update.push(id)
    }
  })

  ;(input.removedIds ?? []).forEach(id => {
    remove.push(id)
  })

  if (!input.removedIds?.length) {
    input.previousIds.forEach(id => {
      if (!nextSet.has(id)) {
        remove.push(id)
      }
    })
  }

  return {
    add,
    update,
    remove
  }
}

const writeIdChanges = (
  delta: DocumentDelta,
  input: DocumentIdChangeInput
): void => {
  switch (input.key) {
    case 'records': {
      const planned = planIdChanges(input)
      planned.add.forEach((id) => {
        documentChange.ids.add(delta, 'records', id)
      })
      planned.update.forEach((id) => {
        documentChange.ids.update(delta, 'records', id)
      })
      planned.remove.forEach((id) => {
        documentChange.ids.remove(delta, 'records', id)
      })
      return
    }
    case 'values': {
      const planned = planIdChanges(input)
      planned.add.forEach((id) => {
        documentChange.ids.add(delta, 'values', id)
      })
      planned.update.forEach((id) => {
        documentChange.ids.update(delta, 'values', id)
      })
      planned.remove.forEach((id) => {
        documentChange.ids.remove(delta, 'values', id)
      })
      return
    }
    case 'fields': {
      const planned = planIdChanges(input)
      planned.add.forEach((id) => {
        documentChange.ids.add(delta, 'fields', id)
      })
      planned.update.forEach((id) => {
        documentChange.ids.update(delta, 'fields', id)
      })
      planned.remove.forEach((id) => {
        documentChange.ids.remove(delta, 'fields', id)
      })
      return
    }
    case 'schemaFields': {
      const planned = planIdChanges(input)
      planned.add.forEach((id) => {
        documentChange.ids.add(delta, 'schemaFields', id)
      })
      planned.update.forEach((id) => {
        documentChange.ids.update(delta, 'schemaFields', id)
      })
      planned.remove.forEach((id) => {
        documentChange.ids.remove(delta, 'schemaFields', id)
      })
      return
    }
    case 'views': {
      const planned = planIdChanges(input)
      planned.add.forEach((id) => {
        documentChange.ids.add(delta, 'views', id)
      })
      planned.update.forEach((id) => {
        documentChange.ids.update(delta, 'views', id)
      })
      planned.remove.forEach((id) => {
        documentChange.ids.remove(delta, 'views', id)
      })
      return
    }
  }
}

const writeValueChanges = (
  delta: DocumentDelta,
  input: {
    previous: DataDoc
    next: DataDoc
    trace: DataviewTrace
  }
): void => {
  const changes = new Map<string, {
    ref: ValueRef
    kind: 'add' | 'update' | 'remove'
  }>()

  const writeChange = (
    ref: ValueRef,
    kind: 'add' | 'update' | 'remove'
  ) => {
    changes.set(encodeValueRef(ref), {
      ref,
      kind
    })
  }

  const touched = dataviewTrace.value.touched(input.trace)
  if (touched === 'all') {
    const previousRefs = collectAllValueRefs(input.previous)
    const previousSet = new Set(previousRefs.map(encodeValueRef))
    const nextRefs = collectAllValueRefs(input.next)
    const nextSet = new Set(nextRefs.map(encodeValueRef))

    nextRefs.forEach(ref => {
      writeChange(
        ref,
        previousSet.has(encodeValueRef(ref))
          ? 'update'
          : 'add'
      )
    })

    previousRefs.forEach(ref => {
      if (!nextSet.has(encodeValueRef(ref))) {
        writeChange(ref, 'remove')
      }
    })
  } else {
    touched?.forEach((fieldIds, recordId) => {
      fieldIds.forEach(fieldId => {
        const ref: ValueRef = {
          recordId,
          fieldId
        }
        const nextValue = readValue(input.next.records.byId[recordId], fieldId)
        const previousValue = readValue(input.previous.records.byId[recordId], fieldId)

        if (nextValue !== undefined) {
          writeChange(
            ref,
            previousValue === undefined
              ? 'add'
              : 'update'
          )
          return
        }

        if (previousValue !== undefined) {
          writeChange(ref, 'remove')
        }
      })
    })
  }

  input.trace.records?.removed?.forEach(recordId => {
    collectRecordValueRefs(input.previous, recordId).forEach(ref => {
      writeChange(ref, 'remove')
    })
  })

  input.trace.fields?.removed?.forEach(fieldId => {
    input.previous.records.ids.forEach(recordId => {
      const record = input.previous.records.byId[recordId]
      if (!record || readValue(record, fieldId) === undefined) {
        return
      }

      writeChange({
        recordId,
        fieldId
      }, 'remove')
    })
  })

  changes.forEach(change => {
    switch (change.kind) {
      case 'add':
        documentChange.ids.add(delta, 'values', change.ref)
        break
      case 'update':
        documentChange.ids.update(delta, 'values', change.ref)
        break
      case 'remove':
        documentChange.ids.remove(delta, 'values', change.ref)
        break
    }
  })
}

export const projectDocumentDelta = (input: {
  previous: DataDoc
  next: DataDoc
  trace: DataviewTrace
}): DocumentDelta | undefined => {
  const delta = documentChange.create()

  if (input.trace.reset) {
    documentChange.flag(delta, 'reset')
    return documentChange.take(delta)
  }

  if (!equal.sameJsonValue(input.previous.meta, input.next.meta)) {
    documentChange.flag(delta, 'meta')
  }

  const nextRecordIds = input.next.records.ids
  writeIdChanges(delta, {
    key: 'records',
    previousIds: input.previous.records.ids,
    nextIds: nextRecordIds,
    touchedIds: toTouchedIds(
      dataviewTrace.record.touchedIds(input.trace),
      nextRecordIds
    ),
    removedIds: [...(input.trace.records?.removed ?? [])]
  })

  writeValueChanges(delta, input)

  const nextFieldIds = readFieldIds(input.next)
  writeIdChanges(delta, {
    key: 'fields',
    previousIds: readFieldIds(input.previous),
    nextIds: nextFieldIds,
    touchedIds: toTouchedIds(
      dataviewTrace.field.touchedIds(input.trace),
      nextFieldIds
    ),
    removedIds: [...(input.trace.fields?.removed ?? [])]
  })

  const nextSchemaFieldIds = readSchemaFieldIds(input.next)
  writeIdChanges(delta, {
    key: 'schemaFields',
    previousIds: readSchemaFieldIds(input.previous),
    nextIds: nextSchemaFieldIds,
    touchedIds: toTouchedIds(
      dataviewTrace.field.schemaIds(input.trace),
      nextSchemaFieldIds
    ),
    removedIds: [...(input.trace.fields?.removed ?? [])]
  })

  const nextViewIds = readViewIds(input.next)
  writeIdChanges(delta, {
    key: 'views',
    previousIds: readViewIds(input.previous),
    nextIds: nextViewIds,
    touchedIds: toTouchedIds(
      dataviewTrace.view.touchedIds(input.trace),
      nextViewIds
    ),
    removedIds: [...(input.trace.views?.removed ?? [])]
  })

  return documentChange.has(delta)
    ? documentChange.take(delta)
    : undefined
}
