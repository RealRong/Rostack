import type {
  Action,
  DataDoc,
  Field,
  View,
  ViewPatch
} from '@dataview/core/contracts'
import type {
  ActionResult,
  ActiveViewApi,
  ViewState
} from '@dataview/engine/contracts'
import {
  createLiveDocumentReader,
  type DocumentReader
} from '@dataview/engine/document/reader'

export interface ActiveContextOptions {
  document: () => DataDoc
  active: () => ViewState | undefined
  dispatch: (action: Action | readonly Action[]) => ActionResult
}

export interface ActiveViewContext {
  id: ActiveViewApi['id']
  state: ActiveViewApi['state']
  reader: DocumentReader
  dispatch: ActiveContextOptions['dispatch']
  view: () => View | undefined
  snapshot: () => ViewState | undefined
  resolveGroupField: (view?: View) => Field | undefined
  patchView: (
    resolve: (view: View, reader: DocumentReader) => ViewPatch | undefined
  ) => boolean
}

export const createActiveContext = (
  options: ActiveContextOptions
): ActiveViewContext => {
  const reader = createLiveDocumentReader(options.document)
  const view = () => options.active()?.view
  const snapshot = () => options.active()
  const patchView = (
    resolve: (currentView: View, currentReader: DocumentReader) => ViewPatch | undefined
  ): boolean => {
    const currentView = view()
    const viewId = reader.views.activeId()
    if (!currentView || !viewId) {
      return false
    }

    const nextPatch = resolve(currentView, reader)
    return nextPatch
      ? options.dispatch({
          type: 'view.patch',
          viewId,
          patch: nextPatch
        }).applied
      : false
  }
  const resolveGroupField = (
    currentView = view()
  ): Field | undefined => {
    const fieldId = currentView?.group?.field
    return fieldId
      ? reader.fields.get(fieldId)
      : undefined
  }

  return {
    id: () => snapshot()?.view.id,
    state: snapshot,
    reader,
    dispatch: options.dispatch,
    view,
    snapshot,
    resolveGroupField,
    patchView
  }
}
