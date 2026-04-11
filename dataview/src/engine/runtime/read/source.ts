import type { CustomFieldId, DataDoc, CustomField, Row, View, RecordId, ViewId } from '@dataview/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  createValueStore,
  type ReadStore,
  type ValueStore,
  type KeyedReadStore
} from '@shared/store'
import {
  getDocumentActiveView,
  getDocumentActiveViewId,
  getDocumentCustomFieldById,
  getDocumentCustomFields,
  getDocumentRecordById,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'

export const equalIds = <T extends string>(left: readonly T[], right: readonly T[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

const equalItems = <T>(left: readonly T[], right: readonly T[]) => (
  left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
)

export interface ReadSource {
  document: ValueStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, Row | undefined>
  customFieldIds: ReadStore<readonly CustomFieldId[]>
  customFields: ReadStore<readonly CustomField[]>
  customField: KeyedReadStore<CustomFieldId, CustomField | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  views: ReadStore<readonly View[]>
  view: KeyedReadStore<ViewId, View | undefined>
  setDocument: (document: DataDoc) => void
}

export const createReadSource = (document: DataDoc): ReadSource => {
  const documentStore = createValueStore<DataDoc>({
    initial: document
  })

  const recordIds: ReadStore<readonly RecordId[]> = createDerivedStore<readonly RecordId[]>({
    get: read => read(documentStore).records.order,
    isEqual: equalIds
  })

  const activeViewId: ReadStore<ViewId | undefined> = createDerivedStore<ViewId | undefined>({
    get: read => getDocumentActiveViewId(read(documentStore))
  })

  const activeView: ReadStore<View | undefined> = createDerivedStore<View | undefined>({
    get: read => getDocumentActiveView(read(documentStore))
  })

  const customFieldIds: ReadStore<readonly CustomFieldId[]> = createDerivedStore<readonly CustomFieldId[]>({
    get: read => read(documentStore).fields.order,
    isEqual: equalIds
  })

  const customFields: ReadStore<readonly CustomField[]> = createDerivedStore<readonly CustomField[]>({
    get: read => getDocumentCustomFields(read(documentStore)),
    isEqual: equalItems
  })

  const viewIds: ReadStore<readonly ViewId[]> = createDerivedStore<readonly ViewId[]>({
    get: read => read(documentStore).views.order,
    isEqual: equalIds
  })

  const views: ReadStore<readonly View[]> = createDerivedStore<readonly View[]>({
    get: read => getDocumentViews(read(documentStore)),
    isEqual: equalItems
  })

  const recordById: KeyedReadStore<RecordId, Row | undefined> = createKeyedDerivedStore<RecordId, Row | undefined>({
    get: (read, recordId) => getDocumentRecordById(read(documentStore), recordId)
  })

  const customFieldById: KeyedReadStore<CustomFieldId, CustomField | undefined> = createKeyedDerivedStore<CustomFieldId, CustomField | undefined>({
    get: (read, fieldId) => getDocumentCustomFieldById(read(documentStore), fieldId)
  })

  const viewById: KeyedReadStore<ViewId, View | undefined> = createKeyedDerivedStore<ViewId, View | undefined>({
    get: (read, viewId) => getDocumentViewById(read(documentStore), viewId)
  })

  return {
    document: documentStore,
    activeViewId,
    activeView,
    recordIds,
    record: recordById,
    customFieldIds,
    customFields,
    customField: customFieldById,
    viewIds,
    views,
    view: viewById,
    setDocument: nextDocument => {
      documentStore.set(nextDocument)
    }
  }
}
