import type {
  Field,
  View,
  ViewPatch
} from '@dataview/core/types'
import type {
  ActiveViewApi,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  Engine
} from '@dataview/engine/contracts/api'
import {
  createDocumentReader,
  type DocumentReader
} from '@dataview/engine/document/reader'

export interface ActiveViewContext {
  id: ActiveViewApi['id']
  state: ActiveViewApi['state']
  reader: DocumentReader
  execute: Engine['execute']
  view: () => View | undefined
  resolveGroupField: (view?: View) => Field | undefined
  patchView: (
    resolve: (view: View, reader: DocumentReader) => ViewPatch | undefined
  ) => boolean
}

export const createActiveContext = (
  engine: Pick<Engine, 'current' | 'doc' | 'execute'>
): ActiveViewContext => {
  const state = (): ViewState | undefined => engine.current().publish?.active
  const reader = createDocumentReader(() => engine.doc())
  const view = () => state()?.view
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
      ? engine.execute({
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
    id: () => state()?.view.id,
    state,
    reader,
    execute: engine.execute.bind(engine),
    view,
    resolveGroupField,
    patchView
  }
}
