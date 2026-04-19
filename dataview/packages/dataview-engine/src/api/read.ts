import {
  getDocumentCustomFieldById,
  getDocumentRecordById,
  getDocumentViewById
} from '@dataview/core/document'
import type {
  EngineReadApi
} from '@dataview/engine/contracts/public'
import type {
  RuntimeStore
} from '@dataview/engine/runtime/store'

export const createEngineReadApi = (
  store: RuntimeStore
): EngineReadApi => ({
  document: () => store.get().doc,
  record: recordId => getDocumentRecordById(store.get().doc, recordId),
  field: fieldId => getDocumentCustomFieldById(store.get().doc, fieldId),
  view: viewId => getDocumentViewById(store.get().doc, viewId),
  activeViewId: () => store.get().doc.activeViewId,
  activeView: () => {
    const state = store.get()
    return state.doc.activeViewId
      ? getDocumentViewById(state.doc, state.doc.activeViewId)
      : undefined
  },
  activeState: () => store.get().currentView.snapshot
})
