import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import {
  cloneDocument
} from '@dataview/core/document'
import type {
  CreateEngineOptions,
  Engine
} from './public'
import {
  createPerfRuntime
} from '../perf/runtime'
import {
  createFieldsEngineApi,
  createRecordsEngineApi,
  createViewEngineApi,
  createViewsEngineApi
} from '../facade'
import {
  createInitialState,
  createStore
} from '../store/state'
import {
  createActiveBaseApi,
  createReadApi
} from '../store/selectors'
import {
  resolveActionBatch
} from '../command'
import { createWriteControl } from '../write/commit'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = cloneDocument(options.document)
  const perf = createPerfRuntime(options.perf)
  const capturePerf = Boolean(options.perf?.trace || options.perf?.stats)
  const store = createStore(createInitialState({
    doc: initialDocument,
    historyCap: historyCapacity,
    capturePerf
  }))
  const read = createReadApi(store)
  const write = createWriteControl({
    store,
    perf,
    capturePerf
  })
  const dispatch = (action: Action | readonly Action[]) => write.run(
    resolveActionBatch({
      document: store.get().doc,
      actions: Array.isArray(action)
        ? action
        : [action]
    })
  )
  const activeBase = createActiveBaseApi({
    store,
    read
  })
  const fields = createFieldsEngineApi({
    read,
    dispatch
  })
  const records = createRecordsEngineApi({
    read,
    dispatch
  })
  const createScopedViewApi = (viewId: string) => createViewEngineApi({
    resolveViewId: () => viewId,
    readDocument: read.document.get,
    readView: () => read.view.get(viewId),
    readState: () => {
      const state = activeBase.state.get()
      return state?.view.id === viewId
        ? state
        : undefined
    },
    readRecord: activeBase.read.getRecord,
    dispatch,
    fields,
    records
  })
  const active = Object.assign(
    createViewEngineApi({
      resolveViewId: activeBase.id.get,
      readDocument: read.document.get,
      readView: activeBase.view.get,
      readState: activeBase.state.get,
      readRecord: activeBase.read.getRecord,
      dispatch,
      fields,
      records
    }),
    activeBase
  )
  active.table = {
    ...active.table,
    state: activeBase.table.state
  }
  active.gallery = {
    ...active.gallery,
    state: activeBase.gallery.state
  }
  active.kanban = {
    ...active.kanban,
    state: activeBase.kanban.state
  }
  const views = createViewsEngineApi({
    read,
    dispatch,
    api: createScopedViewApi
  })

  const engine: Engine = {
    active,
    views,
    fields,
    records,
    document: {
      export: () => cloneDocument(store.get().doc),
      replace: (document: DataDoc) => {
        write.load(cloneDocument(document))
        return cloneDocument(store.get().doc)
      }
    },
    history: {
      state: write.history.state,
      canUndo: write.history.canUndo,
      canRedo: write.history.canRedo,
      undo: write.history.undo,
      redo: write.history.redo,
      clear: write.history.clear
    },
    perf: perf.api,
    read
  }

  return engine
}

export type {
  CreateEngineOptions,
  Engine
} from './public'
