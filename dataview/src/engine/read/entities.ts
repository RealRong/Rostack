import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentActiveViewId,
  getDocumentCustomFieldById,
  getDocumentCustomFields,
  getDocumentRecordById,
  getDocumentRecords,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'
import {
  sameOrder,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import {
  selectDocument,
  selectDocumentById
} from '../state/select'
import type { Store } from '../state/store'

interface DocumentEntityRead<TId, T> {
  list: () => readonly T[]
  get: (id: TId) => T | undefined
  has: (id: TId) => boolean
}

const createDocumentEntityRead = <TId, T>(
  document: DataDoc,
  input: {
    list: (document: DataDoc) => readonly T[]
    get: (document: DataDoc, id: TId) => T | undefined
  }
): DocumentEntityRead<TId, T> => ({
  list: () => input.list(document),
  get: id => input.get(document, id),
  has: id => Boolean(input.get(document, id))
})

const createEntityReadStore = <TId, T>(input: {
  store: Store
  ids: (document: DataDoc) => readonly TId[]
  list: (document: DataDoc) => readonly T[]
  get: (document: DataDoc, id: TId) => T | undefined
}): {
  ids: ReadStore<readonly TId[]>
  list: ReadStore<readonly T[]>
  get: KeyedReadStore<TId, T | undefined>
} => ({
  ids: selectDocument<readonly TId[]>({
    store: input.store,
    read: input.ids,
    isEqual: sameOrder
  }),
  list: selectDocument<readonly T[]>({
    store: input.store,
    read: input.list,
    isEqual: sameOrder
  }),
  get: selectDocumentById<TId, T | undefined>({
    store: input.store,
    read: input.get
  })
})

export interface WriteRead {
  records: DocumentEntityRead<RecordId, DataRecord>
  fields: DocumentEntityRead<CustomFieldId, CustomField>
  views: DocumentEntityRead<ViewId, View> & {
    activeId: () => ViewId | undefined
    active: () => View | undefined
  }
}

export const createWriteRead = (
  document: DataDoc
): WriteRead => {
  const records = createDocumentEntityRead(document, {
    list: getDocumentRecords,
    get: getDocumentRecordById
  })
  const fields = createDocumentEntityRead(document, {
    list: getDocumentCustomFields,
    get: getDocumentCustomFieldById
  })
  const views = createDocumentEntityRead(document, {
    list: getDocumentViews,
    get: getDocumentViewById
  })

  return {
    records,
    fields,
    views: {
      ...views,
      activeId: () => getDocumentActiveViewId(document),
      active: () => {
        const viewId = getDocumentActiveViewId(document)
        return viewId
          ? views.get(viewId)
          : undefined
      }
    }
  }
}

export const createStoreEntityRead = (
  store: Store
): {
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, DataRecord | undefined>
  fieldIds: ReadStore<readonly CustomFieldId[]>
  fields: ReadStore<readonly CustomField[]>
  field: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  views: ReadStore<readonly View[]>
  view: KeyedReadStore<ViewId, View | undefined>
} => {
  const records = createEntityReadStore({
    store,
    ids: document => document.records.order,
    list: getDocumentRecords,
    get: getDocumentRecordById
  })
  const fields = createEntityReadStore({
    store,
    ids: document => document.fields.order,
    list: getDocumentCustomFields,
    get: getDocumentCustomFieldById
  })
  const views = createEntityReadStore({
    store,
    ids: document => document.views.order,
    list: getDocumentViews,
    get: getDocumentViewById
  })

  return {
    recordIds: records.ids,
    record: records.get,
    fieldIds: fields.ids,
    fields: fields.list,
    field: fields.get,
    viewIds: views.ids,
    views: views.list,
    view: views.get
  }
}
