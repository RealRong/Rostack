import type {
  Action,
  DataDoc,
  Field,
  View,
  ViewPatch
} from '@dataview/core/contracts'
import type {
  ActionResult
} from '@dataview/engine/contracts/result'
import type {
  ActiveViewApi,
  ViewState
} from '@dataview/engine/contracts/view'
import {
  createDocumentReader,
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
  resolveGroupField: (view?: View) => Field | undefined
  patchView: (
    resolve: (view: View, reader: DocumentReader) => ViewPatch | undefined
  ) => boolean
}

export const createActiveContext = (
  options: ActiveContextOptions
): ActiveViewContext => {
  const reader = createDocumentReader(options.document)
  const view = () => options.active()?.view
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
    const fieldId = currentView?.group?.fieldId
    return fieldId
      ? reader.fields.get(fieldId)
      : undefined
  }

  return {
    id: () => options.active()?.view.id,
    state: options.active,
    reader,
    dispatch: options.dispatch,
    view,
    resolveGroupField,
    patchView
  }
}
