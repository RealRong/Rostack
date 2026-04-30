import type {
  Field,
  View
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
} from '@dataview/core/document/reader'

export interface ActiveViewContext {
  id: ActiveViewApi['id']
  state: ActiveViewApi['state']
  reader: DocumentReader
  execute: Engine['execute']
  view: () => View | undefined
  resolveGroupField: (view?: View) => Field | undefined
}

export const createActiveContext = (
  engine: Pick<Engine, 'current' | 'doc' | 'execute'>
): ActiveViewContext => {
  const state = (): ViewState | undefined => engine.current().active
  const reader = createDocumentReader(() => engine.doc())
  const view = () => engine.current().docActiveView
  const resolveGroupField = (
    currentView = view()
  ): Field | undefined => {
    const fieldId = currentView?.group?.fieldId
    return fieldId
      ? reader.fields.get(fieldId)
      : undefined
  }

  return {
    id: () => engine.current().docActiveViewId,
    state,
    reader,
    execute: engine.execute.bind(engine),
    view,
    resolveGroupField
  }
}
