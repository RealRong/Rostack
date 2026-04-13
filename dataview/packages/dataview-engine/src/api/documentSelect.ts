import {
  getDocumentCustomFieldById,
  getDocumentCustomFieldIds,
  getDocumentCustomFields,
  getDocumentRecordById,
  getDocumentRecordIds,
  getDocumentRecords,
  getDocumentViewById,
  getDocumentViewIds,
  getDocumentViews
} from '@dataview/core/document'
import type { DocumentSelectApi } from '#engine/contracts/public.ts'
import { createDocumentEntitySelectors, selectDocument } from '#engine/runtime/selectors/document.ts'
import type { RuntimeStore } from '#engine/runtime/store.ts'

export const createDocumentSelectApi = (
  store: RuntimeStore
): DocumentSelectApi => ({
  document: selectDocument({
    store,
    read: document => document
  }),
  records: createDocumentEntitySelectors({
    store,
    ids: getDocumentRecordIds,
    all: getDocumentRecords,
    byId: getDocumentRecordById
  }),
  fields: createDocumentEntitySelectors({
    store,
    ids: getDocumentCustomFieldIds,
    all: getDocumentCustomFields,
    byId: getDocumentCustomFieldById
  }),
  views: createDocumentEntitySelectors({
    store,
    ids: getDocumentViewIds,
    all: getDocumentViews,
    byId: getDocumentViewById
  })
})
