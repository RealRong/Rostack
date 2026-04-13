import type { DocumentSelectApi } from '#engine/contracts/public'
import { listDocumentFields, readDocumentField, readDocumentFieldIds } from '#engine/document/fields'
import { listDocumentRecords, readDocumentRecord, readDocumentRecordIds } from '#engine/document/records'
import { listDocumentViews, readDocumentView, readDocumentViewIds } from '#engine/document/views'
import { createDocumentEntitySelectors, selectDocument } from '#engine/runtime/selectors/document'
import type { RuntimeStore } from '#engine/runtime/store'

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
