import type {
  Action,
  DataDoc
} from '@dataview/core/contracts'
import { impact } from '@dataview/core/commit/impact'
import { document } from '@dataview/core/document'
import { createBaseImpact } from '@dataview/engine/active/shared/baseImpact'
import type {
  CreateEngineOptions,
  Engine
} from '@dataview/engine/contracts/api'
import { createActiveRuntime } from '@dataview/engine/active/runtime/runtime'
import { createPerformanceRuntime } from '@dataview/engine/runtime/performance'
import { now } from '@dataview/engine/runtime/clock'
import { createActiveViewApi } from '@dataview/engine/active/api/active'
import { createFieldsApi } from '@dataview/engine/api/fields'
import { createRecordsApi } from '@dataview/engine/api/records'
import { createViewsApi } from '@dataview/engine/api/views'
import {
  createCoreRuntime,
  createEngineSnapshot,
  createInitialEngineState
} from '@dataview/engine/core/runtime'
import { createDocumentReadContext } from '@dataview/engine/document/reader'
import { planActions } from '@dataview/engine/mutate/planner'
import { createWriteControl } from '@dataview/engine/mutate/commit/runtime'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = document.clone(options.document)
  const performance = createPerformanceRuntime(options.performance)
  const capturePerformance = Boolean(options.performance?.traces || options.performance?.stats)
  const activeRuntime = createActiveRuntime()
  const initialState = createInitialEngineState({
    doc: initialDocument,
    historyCap: historyCapacity
  })
  const initialDocumentContext = createDocumentReadContext(initialDocument)
  const initialActive = activeRuntime.update({
    read: {
      reader: initialDocumentContext.reader,
      fieldsById: initialDocumentContext.fieldsById
    },
    view: {
      plan: initialState.active.plan
    },
    index: {
      state: initialState.active.index
    },
    impact: createBaseImpact(impact.reset(undefined, initialDocument))
  })
  const runtime = createCoreRuntime({
    state: initialState,
    result: {
      rev: initialState.rev,
      snapshot: createEngineSnapshot({
        state: initialState,
        active: initialActive.snapshot
      })
    }
  })
  const write = createWriteControl({
    runtime,
    activeRuntime,
    perf: performance,
    capturePerf: capturePerformance
  })
  const dispatch = (action: Action | readonly Action[]) => {
    const actions = Array.isArray(action)
      ? action
      : [action]
    if (!capturePerformance) {
      return write.run(planActions({
        document: runtime.state().doc,
        actions
      }))
    }

    const planStart = now()
    const batch = planActions({
      document: runtime.state().doc,
      actions
    })

    return write.run({
      ...batch,
      planMs: now() - planStart
    })
  }
  const readDocument = () => runtime.result().snapshot.doc
  const readActiveState = () => runtime.result().snapshot.active
  const fields = createFieldsApi({
    document: readDocument,
    dispatch
  })
  const records = createRecordsApi({
    document: readDocument,
    dispatch
  })
  const active = createActiveViewApi({
    document: readDocument,
    active: readActiveState,
    dispatch
  })
  const views = createViewsApi({
    document: readDocument,
    dispatch
  })

  return {
    result: runtime.result,
    subscribe: runtime.subscribe,
    active,
    views,
    fields,
    records,
    document: {
      get: () => document.clone(readDocument()),
      replace: (nextDocument: DataDoc) => {
        write.load(document.clone(nextDocument))
        return document.clone(readDocument())
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
