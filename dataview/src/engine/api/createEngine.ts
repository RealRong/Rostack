import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import { cloneDocument } from '@dataview/core/document'
import type {
  CreateEngineOptions,
  Engine
} from '../contracts/public'
import { createPerformanceRuntime } from '../state/performance'
import {
  createFieldsApi,
  createRecordsApi,
  createViewApi,
  createViewsApi
} from '../services'
import {
  createInitialState,
  createStore
} from '../state/store'
import {
  createDocumentReadApi
} from '../state/read'
import {
  planActions
} from '../write/resolve'
import { createWriteControl } from '../write/commit'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = cloneDocument(options.document)
  const performance = createPerformanceRuntime(options.performance)
  const capturePerformance = Boolean(options.performance?.traces || options.performance?.stats)
  const store = createStore(createInitialState({
    doc: initialDocument,
    historyCap: historyCapacity,
    capturePerf: capturePerformance
  }))
  const read = createDocumentReadApi(store)
  const write = createWriteControl({
    store,
    perf: performance,
    capturePerf: capturePerformance
  })
  const dispatch = (action: Action | readonly Action[]) => write.run(
    planActions({
      document: store.get().doc,
      actions: Array.isArray(action)
        ? action
        : [action]
    })
  )
  const fields = createFieldsApi({
    read,
    dispatch
  })
  const records = createRecordsApi({
    read,
    dispatch
  })
  const view = createViewApi({
    store,
    read,
    dispatch,
    fields,
    records
  })
  const views = createViewsApi({
    read,
    dispatch
  })

  return {
    read,
    view,
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
    performance: performance.api,
    dispatch
  }
}
