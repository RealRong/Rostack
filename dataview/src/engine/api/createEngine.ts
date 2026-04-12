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
  createActiveEngineApi,
  createViewsEngineApi
} from '../facade'
import {
  createInitialState,
  createStore
} from '../store/state'
import {
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
  const fields = createFieldsEngineApi({
    read,
    dispatch
  })
  const records = createRecordsEngineApi({
    read,
    dispatch
  })
  const active = createActiveEngineApi({
    store,
    read,
    dispatch,
    fields,
    records
  })
  const views = createViewsEngineApi({
    read,
    dispatch
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
