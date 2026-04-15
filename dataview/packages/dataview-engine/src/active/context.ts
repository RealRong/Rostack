import type {
  Action,
  View,
  ViewPatch
} from '@dataview/core/contracts'
import {
  read,
  type ReadStore
} from '@shared/core'
import type {
  ActionResult,
  ActiveViewApi,
  DocumentSelectApi,
  GalleryState,
  KanbanState,
  ViewState
} from '@dataview/engine/contracts/public'
import { selectDocument } from '@dataview/engine/runtime/selectors/document'
import type { RuntimeStore } from '@dataview/engine/runtime/store'
import {
  createActiveSelect,
  createActiveStateStore,
  createGalleryStateStore,
  createKanbanStateStore
} from '@dataview/engine/active/selectors'
import {
  createLiveDocumentReader,
  createStaticDocumentReader,
  type DocumentReader
} from '@dataview/engine/document/reader'

export interface ActiveContextOptions {
  store: RuntimeStore
  select: DocumentSelectApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}

export interface ActiveViewContext {
  id: ActiveViewApi['id']
  config: ActiveViewApi['config']
  stateStore: ActiveViewApi['state']
  select: ActiveViewApi['select']
  galleryState: ReadStore<GalleryState | undefined>
  kanbanState: ReadStore<KanbanState | undefined>
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
  const id = selectDocument({
    store: options.store,
    read: document => createStaticDocumentReader(document).views.activeId()
  })
  const config = selectDocument({
    store: options.store,
    read: document => createStaticDocumentReader(document).views.active()
  })
  const stateStore = createActiveStateStore(options.store)
  const select = createActiveSelect(stateStore)
  const galleryState = createGalleryStateStore(stateStore)
  const kanbanState = createKanbanStateStore(stateStore)
  const readDocument = () => read(options.select.document)
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
    select,
    galleryState,
    kanbanState,
    reader,
    dispatch: options.dispatch,
    view,
    snapshot,
    patch
  }
}
