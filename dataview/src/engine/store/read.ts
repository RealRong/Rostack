import type {
  CustomField,
  CustomFieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentCustomFieldById,
  getDocumentCustomFields,
  getDocumentRecordById,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'
import {
  sameOrder
} from '@shared/core'
import type {
  EngineReadApi
} from '../api/public'
import {
  selectDoc,
  selectDocById
} from './base'
import type {
  Store
} from './state'

export const createReadApi = (
  store: Store
): EngineReadApi => ({
  document: selectDoc({
    store,
    read: document => document
  }),
  recordIds: selectDoc<readonly RecordId[]>({
    store,
    read: document => document.records.order,
    isEqual: sameOrder
  }),
  record: selectDocById({
    store,
    read: getDocumentRecordById
  }),
  customFieldIds: selectDoc<readonly CustomFieldId[]>({
    store,
    read: document => document.fields.order,
    isEqual: sameOrder
  }),
  customFields: selectDoc<readonly CustomField[]>({
    store,
    read: getDocumentCustomFields,
    isEqual: sameOrder
  }),
  customField: selectDocById({
    store,
    read: getDocumentCustomFieldById
  }),
  viewIds: selectDoc<readonly ViewId[]>({
    store,
    read: document => document.views.order,
    isEqual: sameOrder
  }),
  views: selectDoc<readonly View[]>({
    store,
    read: getDocumentViews,
    isEqual: sameOrder
  }),
  view: selectDocById<ViewId, View | undefined>({
    store,
    read: getDocumentViewById
  })
})
