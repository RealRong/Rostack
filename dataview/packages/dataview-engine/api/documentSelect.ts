import type { DocumentSelectApi } from '../contracts/public'
import { listDocumentFields, readDocumentField, readDocumentFieldIds } from '../document/fields'
import { listDocumentRecords, readDocumentRecord, readDocumentRecordIds } from '../document/records'
import { listDocumentViews, readDocumentView, readDocumentViewIds } from '../document/views'
import { createDocumentEntitySelectors, selectDocument } from '../runtime/selectors/document'
import type { RuntimeStore } from '../runtime/store'

export const createDocumentSelectApi = (
  store: RuntimeStore
): DocumentSelectApi => ({
  document: selectDocument({
    store,
    read: document => document
  }),
  records: createDocumentEntitySelectors({
    store,
    ids: readDocumentRecordIds,
    all: listDocumentRecords,
    byId: readDocumentRecord
  }),
  fields: createDocumentEntitySelectors({
    store,
    ids: readDocumentFieldIds,
    all: listDocumentFields,
    byId: readDocumentField
  }),
  views: createDocumentEntitySelectors({
    store,
    ids: readDocumentViewIds,
    all: listDocumentViews,
    byId: readDocumentView
  })
})
