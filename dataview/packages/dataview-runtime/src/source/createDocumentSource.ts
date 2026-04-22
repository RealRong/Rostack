import { document as documentApi } from '@dataview/core/document'
import type {
  CustomField,
  DataRecord,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  DocDelta,
  EngineSnapshot
} from '@dataview/engine'
import type {
  DocumentSource
} from '@dataview/runtime/source/contracts'
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
  records: EntitySourceRuntime<RecordId, DataRecord>
  fields: EntitySourceRuntime<FieldId, CustomField>
  views: EntitySourceRuntime<ViewId, View>
  clear(): void
}

export const createDocumentSourceRuntime = (): DocumentSourceRuntime => {
  const records = createEntitySourceRuntime<RecordId, DataRecord>()
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
      records: records.source,
      fields: {
        ...fields.source,
        list: fieldList
      },
      views: {
        ...views.source,
        list: viewList
      }
    },
    records,
    fields,
    views,
    clear: () => {
      records.clear()
      fields.clear()
      views.clear()
    }
  }
}

export const resetDocumentSource = (input: {
  runtime: DocumentSourceRuntime
  snapshot: EngineSnapshot
}) => {
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
