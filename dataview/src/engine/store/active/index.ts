import {
  getDocumentActiveView,
  getDocumentActiveViewId
} from '@dataview/core/document'
import type {
  ActiveEngineApi,
  EngineReadApi
} from '../../api/public'
import {
  selectDoc
} from '../base'
import type {
  Store
} from '../state'
import {
  createActiveReadApi,
  createActiveSelectApi
} from './read'
import {
  createActiveGalleryStateStore,
  createActiveKanbanStateStore,
  createActiveStateStore
} from './state'

export const createActiveStoreApi = (input: {
  store: Store
  read: EngineReadApi
}): Pick<ActiveEngineApi, 'id' | 'view' | 'state' | 'select' | 'read'> => {
  const id = selectDoc({
    store: input.store,
    read: getDocumentActiveViewId
  })
  const view = selectDoc({
    store: input.store,
    read: getDocumentActiveView
  })
  const state = createActiveStateStore(input.store)

  return {
    id,
    view,
    state,
    select: createActiveSelectApi(state),
    read: createActiveReadApi({
      read: input.read,
      state
    })
  }
}

export const createActiveViewStateStores = (store: Store): {
  gallery: Pick<ActiveEngineApi['gallery'], 'state'>
  kanban: Pick<ActiveEngineApi['kanban'], 'state'>
} => ({
  gallery: {
    state: createActiveGalleryStateStore(store)
  },
  kanban: {
    state: createActiveKanbanStateStore(store)
  }
})
