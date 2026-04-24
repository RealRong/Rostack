import type {
  DataDoc,
  Field,
  Intent as CoreIntent,
  View,
  ViewPatch
} from '@dataview/core/contracts'
import type {
  ActiveViewApi,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  BatchExecuteResult,
  ExecuteResult,
} from '@dataview/engine/types/intent'
import {
  createDocumentReader,
  type DocumentReader
} from '@dataview/engine/document/reader'

export interface ActiveContextOptions {
  document: () => DataDoc
  active: () => ViewState | undefined
  execute: (intent: CoreIntent) => ExecuteResult
  executeMany: (intents: readonly CoreIntent[]) => BatchExecuteResult
}

export interface ActiveViewContext {
  id: ActiveViewApi['id']
  state: ActiveViewApi['state']
  reader: DocumentReader
  execute: ActiveContextOptions['execute']
  executeMany: ActiveContextOptions['executeMany']
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
      ? options.execute({
          type: 'view.patch',
          id: viewId,
          patch: nextPatch
        }).ok
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
    execute: options.execute,
    executeMany: options.executeMany,
    view,
    resolveGroupField,
    patchView
  }
}
