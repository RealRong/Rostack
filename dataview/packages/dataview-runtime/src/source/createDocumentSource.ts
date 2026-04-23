import { document as documentApi } from '@dataview/core/document'
import type {
  CustomField,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import { equal, store } from '@shared/core'
import type {
  DocDelta,
  EngineSnapshot
} from '@dataview/engine'
import type {
  DocumentSource
} from '@dataview/runtime/source/contracts'
import type { RecordValueRef } from '@dataview/runtime/refs'
import {
  recordValueKey
} from '@dataview/runtime/refs'
import {
  applyEntityDelta,
  createEntitySourceRuntime,
  resetEntityRuntime,
  type EntitySourceRuntime
} from '@dataview/runtime/source/patch'
import {
  createPresentSourceListStore
} from '@dataview/runtime/source/list'

const EMPTY_FIELD_IDS = [] as readonly FieldId[]

export interface DocumentSourceRuntime {
  source: DocumentSource
  meta: store.ValueStore<DataDoc['meta']>
  records: EntitySourceRuntime<RecordId, DataRecord>
  values: {
    source: store.KeyedReadStore<RecordValueRef, unknown>
    values: store.KeyedStore<string, unknown>
    clear(): void
  }
  fields: EntitySourceRuntime<FieldId, CustomField>
  views: EntitySourceRuntime<ViewId, View>
  clear(): void
}

const readRecordValue = (
  record: DataRecord,
  fieldId: FieldId
) => fieldId === TITLE_FIELD_ID
  ? record.title
  : record.values[fieldId]

const collectRecordValueRefs = (
  record: DataRecord
) => [
  TITLE_FIELD_ID,
  ...Object.keys(record.values) as FieldId[]
]

const collectRecordValueEntries = (
  record: DataRecord
): readonly (readonly [string, unknown])[] => collectRecordValueRefs(record).flatMap(fieldId => {
  const value = readRecordValue(record, fieldId)
  return value === undefined
    ? []
    : [[recordValueKey({
      recordId: record.id,
      fieldId
    }), value] as const]
})

const collectRecordValueKeys = (
  record: DataRecord
): readonly string[] => collectRecordValueRefs(record).map(fieldId => recordValueKey({
  recordId: record.id,
  fieldId
}))

const createDocumentValueSourceRuntime = () => {
  const values = store.createKeyedStore<string, unknown>({
    emptyValue: undefined,
    isEqual: equal.sameJsonValue
  })

  return {
    source: store.createKeyedDerivedStore<RecordValueRef, unknown>({
      keyOf: recordValueKey,
      get: ref => store.read(values, recordValueKey(ref)),
      isEqual: equal.sameJsonValue
    }),
    values,
    clear: () => {
      values.clear()
    }
  }
}

const resetDocumentValues = (input: {
  runtime: DocumentSourceRuntime['values']
  snapshot: EngineSnapshot
}) => {
  input.runtime.clear()
  const recordIds = documentApi.records.ids(input.snapshot.doc)
  if (!recordIds.length) {
    return
  }

  const set = recordIds.flatMap(recordId => {
    const record = documentApi.records.get(input.snapshot.doc, recordId)
    return record
      ? collectRecordValueEntries(record)
      : []
  })
  if (!set.length) {
    return
  }

  input.runtime.values.patch({
    set
  })
}

const applyDocumentValueDelta = (input: {
  runtime: Pick<DocumentSourceRuntime, 'records' | 'values'>
  delta: DocDelta
  snapshot: EngineSnapshot
}) => {
  if (input.delta.records?.update?.length !== undefined || input.delta.records?.remove?.length !== undefined || input.delta.fields?.remove?.length !== undefined) {
    const set: Array<readonly [string, unknown]> = []
    const deleteKeys = new Set<string>()
    const updatedRecordIds = input.delta.records?.update ?? []

    updatedRecordIds.forEach(recordId => {
      const previousRecord = input.runtime.records.source.get(recordId)
      const nextRecord = documentApi.records.get(input.snapshot.doc, recordId)
      if (!nextRecord) {
        if (previousRecord) {
          collectRecordValueKeys(previousRecord).forEach(key => {
            deleteKeys.add(key)
          })
        }
        return
      }

      collectRecordValueEntries(nextRecord).forEach(entry => {
        set.push(entry)
      })
      if (!previousRecord) {
        return
      }

      const nextKeySet = new Set(collectRecordValueKeys(nextRecord))
      collectRecordValueKeys(previousRecord).forEach(key => {
        if (!nextKeySet.has(key)) {
          deleteKeys.add(key)
        }
      })
    })

    input.delta.records?.remove?.forEach(recordId => {
      const previousRecord = input.runtime.records.source.get(recordId)
      if (!previousRecord) {
        return
      }

      collectRecordValueKeys(previousRecord).forEach(key => {
        deleteKeys.add(key)
      })
    })

    input.delta.fields?.remove?.forEach(fieldId => {
      store.peek(input.runtime.records.ids).forEach(recordId => {
        deleteKeys.add(recordValueKey({
          recordId,
          fieldId
        }))
      })
    })

    if (!set.length && !deleteKeys.size) {
      return
    }

    input.runtime.values.values.patch({
      ...(set.length
        ? {
            set
          }
        : {}),
      ...(deleteKeys.size
        ? {
            delete: [...deleteKeys]
          }
        : {})
    })
  }
}

export const createDocumentSourceRuntime = (): DocumentSourceRuntime => {
  const meta = store.createValueStore<DataDoc['meta']>({
    initial: undefined,
    isEqual: equal.sameJsonValue
  })
  const records = createEntitySourceRuntime<RecordId, DataRecord>()
  const values = createDocumentValueSourceRuntime()
  const fields = createEntitySourceRuntime<FieldId, CustomField>(EMPTY_FIELD_IDS)
  const views = createEntitySourceRuntime<ViewId, View>()
  const fieldList = createPresentSourceListStore({
    ids: fields.source.ids,
    values: fields.source
  })
  const viewList = createPresentSourceListStore({
    ids: views.source.ids,
    values: views.source
  })

  return {
    source: {
      meta,
      records: records.source,
      values: values.source,
      fields: {
        ...fields.source,
        list: fieldList
      },
      views: {
        ...views.source,
        list: viewList
      }
    },
    meta,
    records,
    values,
    fields,
    views,
    clear: () => {
      meta.set(undefined)
      records.clear()
      values.clear()
      fields.clear()
      views.clear()
    }
  }
}

export const resetDocumentSource = (input: {
  runtime: DocumentSourceRuntime
  snapshot: EngineSnapshot
}) => {
  input.runtime.meta.set(input.snapshot.doc.meta)
  const recordIds = documentApi.records.ids(input.snapshot.doc)
  const fieldIds = documentApi.fields.custom.ids(input.snapshot.doc)
  const viewIds = documentApi.views.ids(input.snapshot.doc)

  resetEntityRuntime(input.runtime.records, {
    ids: recordIds,
    values: recordIds.flatMap(recordId => {
      const value = documentApi.records.get(input.snapshot.doc, recordId)
      return value
        ? [[recordId, value] as const]
        : []
      })
  })
  resetDocumentValues({
    runtime: input.runtime.values,
    snapshot: input.snapshot
  })
  resetEntityRuntime(input.runtime.fields, {
    ids: fieldIds,
    values: fieldIds.flatMap(fieldId => {
      const value = documentApi.fields.custom.get(input.snapshot.doc, fieldId)
      return value
        ? [[fieldId, value] as const]
        : []
    })
  })
  resetEntityRuntime(input.runtime.views, {
    ids: viewIds,
    values: viewIds.flatMap(viewId => {
      const value = documentApi.views.get(input.snapshot.doc, viewId)
      return value
        ? [[viewId, value] as const]
        : []
    })
  })
}

export const applyDocumentDelta = (input: {
  runtime: DocumentSourceRuntime
  delta: DocDelta | undefined
  snapshot: EngineSnapshot
}) => {
  if (!input.delta) {
    return
  }

  if (input.delta.meta) {
    input.runtime.meta.set(input.snapshot.doc.meta)
  }
  applyDocumentValueDelta({
    runtime: input.runtime,
    delta: input.delta,
    snapshot: input.snapshot
  })
  applyEntityDelta({
    delta: input.delta.records,
    runtime: input.runtime.records,
    readIds: () => documentApi.records.ids(input.snapshot.doc),
    readValue: recordId => documentApi.records.get(input.snapshot.doc, recordId)
  })
  applyEntityDelta({
    delta: input.delta.fields,
    runtime: input.runtime.fields,
    readIds: () => documentApi.fields.custom.ids(input.snapshot.doc),
    readValue: fieldId => documentApi.fields.custom.get(input.snapshot.doc, fieldId)
  })
  applyEntityDelta({
    delta: input.delta.views,
    runtime: input.runtime.views,
    readIds: () => documentApi.views.ids(input.snapshot.doc),
    readValue: viewId => documentApi.views.get(input.snapshot.doc, viewId)
  })
}
