import type { DocumentSelectApi } from '#engine/contracts/public.ts'
import { listDocumentFields, readDocumentField, readDocumentFieldIds } from '#engine/document/fields.ts'
import { listDocumentRecords, readDocumentRecord, readDocumentRecordIds } from '#engine/document/records.ts'
import { listDocumentViews, readDocumentView, readDocumentViewIds } from '#engine/document/views.ts'
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
