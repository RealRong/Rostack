import {
  document
} from '@dataview/core/document'
import type {
  EngineReadApi
} from '@dataview/engine/contracts'
import type {
  RuntimeStore
} from '@dataview/engine/runtime/store'

export const createEngineReadApi = (
  store: RuntimeStore
): EngineReadApi => ({
  document: () => store.get().doc,
  record: recordId => document.records.get(store.get().doc, recordId),
  field: fieldId => document.fields.custom.get(store.get().doc, fieldId),
  view: viewId => document.views.get(store.get().doc, viewId),
  activeViewId: () => store.get().doc.activeViewId,
  activeView: () => {
    const state = store.get()
    return state.doc.activeViewId
      ? document.views.get(state.doc, state.doc.activeViewId)
      : undefined
  },
  activeState: () => store.get().currentView.snapshot
})
