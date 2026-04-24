import { document as documentApi } from '@dataview/core/document'
import type {
  CustomField,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId,
  ValueRef,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal, store } from '@shared/core'
import type {
  DocDelta,
  EngineSnapshot
} from '@dataview/engine'
import type {
  DocumentSource
} from '@dataview/runtime/source/contracts'
import {
  valueId,
  type ValueId
} from '@dataview/runtime/identity'
import {
  applyMappedKeyDelta,
  applyListedDelta,
  createMappedTableSourceRuntime,
  createEntitySourceRuntime,
  resetEntityRuntime,
  type EntitySourceRuntime
} from '@dataview/runtime/source/patch'
import {
  createPresentSourceListStore
} from '@dataview/runtime/source/list'

const EMPTY_FIELD_IDS = [] as readonly FieldId[]

interface DocumentValueSourceRuntime {
  source: store.KeyedReadStore<ValueRef, unknown>
  table: store.TableStore<ValueId, unknown>
  clear(): void
}

export interface DocumentSourceRuntime {
  source: DocumentSource
  meta: store.ValueStore<DataDoc['meta']>
  records: EntitySourceRuntime<RecordId, DataRecord>
  values: DocumentValueSourceRuntime
  fields: EntitySourceRuntime<FieldId, CustomField>
  views: EntitySourceRuntime<ViewId, View>
  clear(): void
}

const createDocumentValueSourceRuntime = (): DocumentValueSourceRuntime => {
  const values = createMappedTableSourceRuntime<ValueRef, ValueId, unknown>({
    keyOf: valueId,
    isEqual: equal.sameJsonValue
  })

  return {
    source: values.source,
    table: values.table,
    clear: values.clear
  }
}

const resetDocumentValues = (input: {
  runtime: DocumentValueSourceRuntime
  snapshot: EngineSnapshot
}) => {
  const recordIds = documentApi.records.ids(input.snapshot.doc)
  const set = recordIds.flatMap(recordId => {
    const record = documentApi.records.get(input.snapshot.doc, recordId)
    return record
      ? documentApi.values.entries(record).map(([fieldId, value]) => [
          valueId({
            recordId,
            fieldId
          }),
          value
        ] as const)
      : []
  })

  input.runtime.table.write.replace(new Map(set))
}

const applyDocumentValueDelta = (input: {
  runtime: Pick<DocumentSourceRuntime, 'values'>
  delta: DocDelta
  snapshot: EngineSnapshot
}) => {
  applyMappedKeyDelta({
    delta: input.delta.values,
    table: input.runtime.values.table,
    keyOf: valueId,
    readValue: ref => {
      const record = documentApi.records.get(input.snapshot.doc, ref.recordId)
      return record
        ? documentApi.values.get(record, ref.fieldId)
        : undefined
    }
  })
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

  if (input.delta.reset) {
    resetDocumentSource(input)
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
  applyListedDelta({
    delta: input.delta.records,
    runtime: input.runtime.records,
    readIds: () => documentApi.records.ids(input.snapshot.doc),
    readValue: recordId => documentApi.records.get(input.snapshot.doc, recordId)
  })
  applyListedDelta({
    delta: input.delta.fields,
    runtime: input.runtime.fields,
    readIds: () => documentApi.fields.custom.ids(input.snapshot.doc),
    readValue: fieldId => documentApi.fields.custom.get(input.snapshot.doc, fieldId)
  })
  applyListedDelta({
    delta: input.delta.views,
    runtime: input.runtime.views,
    readIds: () => documentApi.views.ids(input.snapshot.doc),
    readValue: viewId => documentApi.views.get(input.snapshot.doc, viewId)
  })
}
