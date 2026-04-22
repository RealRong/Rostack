import type {
  Action,
  DataDoc,
  View,
  ViewPatch
} from '@dataview/core/contracts'
import { store } from '@shared/core'
import type {
  ActionResult,
  ActiveViewApi,
  EngineSource,
  ViewState
} from '@dataview/engine/contracts'
import {
  createLiveDocumentReader,
  type DocumentReader
} from '@dataview/engine/document/reader'

export interface ActiveContextOptions {
  document: () => DataDoc
  source: EngineSource
  state: ActiveViewApi['state']
  dispatch: (action: Action | readonly Action[]) => ActionResult
}

export interface ActiveViewContext {
  id: ActiveViewApi['id']
  config: ActiveViewApi['config']
  stateStore: ActiveViewApi['state']
  reader: DocumentReader
  dispatch: ActiveContextOptions['dispatch']
  view: () => View | undefined
  snapshot: () => ViewState | undefined
  patch: (
    resolve: (view: View, reader: DocumentReader) => ViewPatch | undefined
  ) => boolean
}

export const createActiveContext = (
  options: ActiveContextOptions
): ActiveViewContext => {
  const id = options.source.active.view.id
  const config = options.source.active.view.current
  const stateStore = options.state
  const reader = createLiveDocumentReader(options.document)
  const view = () => store.read(config)
  const snapshot = () => store.read(stateStore)
  const patch = (
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

  return {
    id,
    config,
    stateStore,
    reader,
    dispatch: options.dispatch,
    view,
    snapshot,
    patch
  }
}
