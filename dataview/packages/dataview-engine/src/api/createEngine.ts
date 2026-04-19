import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import { cloneDocument } from '@dataview/core/document'
import type {
  CreateEngineOptions,
  Engine
} from '@dataview/engine/contracts/public'
import { createPerformanceRuntime } from '@dataview/engine/runtime/performance'
import { now } from '@dataview/engine/runtime/clock'
import { createActiveViewApi } from '@dataview/engine/api/active'
import { createFieldsApi } from '@dataview/engine/api/fields'
import { createRecordsApi } from '@dataview/engine/api/records'
import { createViewsApi } from '@dataview/engine/api/views'
import { createEngineReadApi } from '@dataview/engine/api/read'
import {
  createRuntimeState,
  createStore
} from '@dataview/engine/runtime/store'
import { planActions } from '@dataview/engine/mutate/planner'
import { createWriteControl } from '@dataview/engine/mutate/commit/runtime'
import { createEngineSourceRuntime } from '@dataview/engine/source/runtime'

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
  const readApi = createEngineReadApi(store)
  const sourceRuntime = createEngineSourceRuntime({
    store
  })
  const write = createWriteControl({
    store,
    perf: performance,
    capturePerf: capturePerformance
  })
  const dispatch = (action: Action | readonly Action[]) => {
    const actions = Array.isArray(action)
      ? action
      : [action]
    if (!capturePerformance) {
      return write.run(planActions({
        document: store.get().doc,
        actions
      }))
    }

    const planStart = now()
    const batch = planActions({
      document: store.get().doc,
      actions
    })

    return write.run({
      ...batch,
      planMs: now() - planStart
    })
  }
  const fields = createFieldsApi({
    source: sourceRuntime.source.doc,
    dispatch
  })
  const records = createRecordsApi({
    source: sourceRuntime.source.doc,
    dispatch
  })
  const active = createActiveViewApi({
    store,
    source: sourceRuntime.source,
    dispatch
  })
  const views = createViewsApi({
    source: sourceRuntime.source.doc,
    dispatch
  })

  return {
    read: readApi,
    source: sourceRuntime.source,
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
