import {
  document
} from '@dataview/core/document'
import type { DataDoc } from '@dataview/core/contracts'
import type {
  EngineReadApi
} from '@dataview/engine/contracts/api'

export const createEngineReadApi = (
  readDocument: () => DataDoc
): EngineReadApi => ({
  document: readDocument,
  record: recordId => document.records.get(readDocument(), recordId),
  field: fieldId => document.fields.custom.get(readDocument(), fieldId),
  view: viewId => document.views.get(readDocument(), viewId)
})
