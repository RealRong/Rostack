import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import { cloneDocument } from '@dataview/core/document'
import type {
  CreateEngineOptions,
  Engine
} from '#dataview-engine/contracts/public'
import { createPerformanceRuntime } from '#dataview-engine/runtime/performance'
import { createActiveViewApi } from '#dataview-engine/api/active'
import { createDocumentSelectApi } from '#dataview-engine/api/documentSelect'
import { createFieldsApi } from '#dataview-engine/api/fields'
import { createRecordsApi } from '#dataview-engine/api/records'
import { createViewsApi } from '#dataview-engine/api/views'
import {
  createRuntimeState,
  createStore
} from '#dataview-engine/runtime/store'
import { planActions } from '#dataview-engine/mutate/planner'
import { createWriteControl } from '#dataview-engine/mutate/commit/runtime'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = cloneDocument(options.document)
  const performance = createPerformanceRuntime(options.performance)
  const capturePerformance = Boolean(options.performance?.traces || options.performance?.stats)
  const store = createStore(createRuntimeState({
    doc: initialDocument,
    historyCap: historyCapacity,
    capturePerf: capturePerformance
  }))
  const select = createDocumentSelectApi(store)
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
    select,
    dispatch
  })
  const records = createRecordsApi({
    select,
    dispatch
  })
  const active = createActiveViewApi({
    store,
    select,
    dispatch,
    fields,
    records
  })
  const views = createViewsApi({
    select,
    dispatch
  })

  return {
    select,
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
    performance: performance.api,
    dispatch
  }
}
