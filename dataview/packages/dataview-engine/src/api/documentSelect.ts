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
import type { DocumentSelectApi } from '@dataview/engine/contracts/public'
import { createDocumentEntitySelectors, selectDocument } from '@dataview/engine/runtime/selectors/document'
import type { RuntimeStore } from '@dataview/engine/runtime/store'

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
