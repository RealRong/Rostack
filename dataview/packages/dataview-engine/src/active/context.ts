import type {
  Action,
  View,
  ViewPatch
} from '@dataview/core/contracts'
import {
  createDerivedStore,
  read
} from '@shared/core'
import type {
  ActionResult,
  ActiveViewApi,
  EngineSource,
  ViewState
} from '@dataview/engine/contracts/public'
import type { RuntimeStore } from '@dataview/engine/runtime/store'
import {
  createLiveDocumentReader,
  type DocumentReader
} from '@dataview/engine/document/reader'

export interface ActiveContextOptions {
  store: RuntimeStore
  source: EngineSource
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
  const stateStore = createDerivedStore<ViewState | undefined>({
    get: () => read(options.store).currentView.snapshot
  })
  const readDocument = () => options.store.get().doc
  const reader = createLiveDocumentReader(readDocument)
  const view = () => read(config)
  const snapshot = () => read(stateStore)
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
