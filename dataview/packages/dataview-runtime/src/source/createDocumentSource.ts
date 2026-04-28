import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  ValueRef,
  View,
  ViewId
} from '@dataview/core/types'
import { equal, store } from '@shared/core'
import type {
  DocumentSource
} from '@dataview/runtime/source/contracts'
import {
  valueId,
  type ValueId
} from '@dataview/runtime/identity'
import {
  createMappedTableSourceRuntime,
  createEntitySourceRuntime,
  resetEntityRuntime,
  resetSourceTableRuntime,
  type EntitySourceRuntime
} from '@dataview/runtime/source/patch'
import {
  createPresentSourceListStore
} from '@dataview/runtime/source/list'

const EMPTY_FIELD_IDS = [] as readonly FieldId[]
const EMPTY_SCHEMA_FIELD_IDS = [] as readonly CustomFieldId[]
type DocumentSnapshot = {
  doc: DataDoc
}

interface DocumentValueSourceRuntime {
  source: store.KeyedReadStore<ValueRef, unknown>
  store: store.KeyedStore<ValueId, unknown | undefined>
  clear(): void
}

export interface DocumentSourceRuntime {
  source: DocumentSource
  meta: store.ValueStore<DataDoc['meta']>
  records: EntitySourceRuntime<RecordId, DataRecord>
  values: DocumentValueSourceRuntime
  fields: EntitySourceRuntime<FieldId, Field>
  schemaFields: EntitySourceRuntime<CustomFieldId, CustomField>
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
    store: values.store,
    clear: values.clear
  }
}

const readFieldIds = (
  doc: DataDoc
): readonly FieldId[] => ['title', ...doc.fields.ids]

const readValueEntries = (
  record: DataRecord,
  fieldIds: ReadonlySet<CustomFieldId>
): readonly (readonly [FieldId, unknown])[] => [
  ['title', record.title] as const,
  ...(Object.entries(record.values) as [CustomFieldId, unknown][])
    .filter(([fieldId]) => fieldIds.has(fieldId))
    .map(([fieldId, value]) => [fieldId, value] as const)
].filter((entry) => entry[1] !== undefined)

const resetDocumentValues = (input: {
  runtime: DocumentValueSourceRuntime
  snapshot: DocumentSnapshot
}) => {
  const fieldIds = new Set(input.snapshot.doc.fields.ids)
  const recordIds = input.snapshot.doc.records.ids
  const set = recordIds.flatMap(recordId => {
    const record = input.snapshot.doc.records.byId[recordId]
    return record
      ? readValueEntries(record, fieldIds).map(([fieldId, value]) => [
          valueId({
            recordId,
            fieldId
          }),
          value
        ] as const)
      : []
  })

  resetSourceTableRuntime(input.runtime, set)
}

export const createDocumentSourceRuntime = (): DocumentSourceRuntime => {
  const meta = store.createValueStore<DataDoc['meta']>({
    initial: undefined,
    isEqual: equal.sameJsonValue
  })
  const records = createEntitySourceRuntime<RecordId, DataRecord>()
  const values = createDocumentValueSourceRuntime()
  const fields = createEntitySourceRuntime<FieldId, Field>(EMPTY_FIELD_IDS)
  const schemaFields = createEntitySourceRuntime<CustomFieldId, CustomField>(EMPTY_SCHEMA_FIELD_IDS)
  const views = createEntitySourceRuntime<ViewId, View>()
  const fieldList = createPresentSourceListStore({
    ids: fields.source.ids,
    values: fields.source
  })
  const schemaFieldList = createPresentSourceListStore({
    ids: schemaFields.source.ids,
    values: schemaFields.source
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
      schema: {
        fields: {
          ...schemaFields.source,
          list: schemaFieldList
        }
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
    schemaFields,
    views,
    clear: () => {
      meta.set(undefined)
      records.clear()
      values.clear()
      fields.clear()
      schemaFields.clear()
      views.clear()
    }
  }
}

export const resetDocumentSource = (input: {
  runtime: DocumentSourceRuntime
  snapshot: DocumentSnapshot
}) => {
  input.runtime.meta.set(input.snapshot.doc.meta)
  const recordIds = input.snapshot.doc.records.ids
  const fieldIds = readFieldIds(input.snapshot.doc)
  const schemaFieldIds = input.snapshot.doc.fields.ids
  const viewIds = input.snapshot.doc.views.ids

  resetEntityRuntime(input.runtime.records, {
    ids: recordIds,
    values: recordIds.flatMap(recordId => {
      const value = input.snapshot.doc.records.byId[recordId]
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
      const value = fieldId === 'title'
        ? {
            id: 'title',
            name: 'Title',
            kind: 'title',
            system: true
          } satisfies Field
        : input.snapshot.doc.fields.byId[fieldId]
      return value
        ? [[fieldId, value] as const]
        : []
    })
  })
  resetEntityRuntime(input.runtime.schemaFields, {
    ids: schemaFieldIds,
    values: schemaFieldIds.flatMap(fieldId => {
      const value = input.snapshot.doc.fields.byId[fieldId]
      return value
        ? [[fieldId, value] as const]
        : []
    })
  })
  resetEntityRuntime(input.runtime.views, {
    ids: viewIds,
    values: viewIds.flatMap(viewId => {
      const value = input.snapshot.doc.views.byId[viewId]
      return value
        ? [[viewId, value] as const]
        : []
    })
  })
}
