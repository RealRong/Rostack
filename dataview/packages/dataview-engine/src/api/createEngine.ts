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
} from '@dataview/engine/contracts'
import { createActiveProjectionRuntime } from '@dataview/engine/active/projection/runtime'
import { createPerformanceRuntime } from '@dataview/engine/runtime/performance'
import { now } from '@dataview/engine/runtime/clock'
import { createActiveViewApi } from '@dataview/engine/api/active'
import { createFieldsApi } from '@dataview/engine/api/fields'
import { createRecordsApi } from '@dataview/engine/api/records'
import { createViewsApi } from '@dataview/engine/api/views'
import { createEngineReadApi } from '@dataview/engine/api/read'
import {
  createCoreRuntime,
  createEngineSnapshot,
  createInitialEngineState
} from '@dataview/engine/core/runtime'
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'
import { planActions } from '@dataview/engine/mutate/planner'
import { createWriteControl } from '@dataview/engine/mutate/commit/runtime'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = document.clone(options.document)
  const performance = createPerformanceRuntime(options.performance)
  const capturePerformance = Boolean(options.performance?.traces || options.performance?.stats)
  const activeRuntime = createActiveProjectionRuntime()
  const initialState = createInitialEngineState({
    doc: initialDocument,
    historyCap: historyCapacity
  })
  const initialDocumentContext = createStaticDocumentReadContext(initialDocument)
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
  const core = {
    read: {
      result: () => runtime.result(),
      snapshot: () => runtime.result().snapshot,
      delta: () => runtime.result().delta,
      document: () => runtime.state().doc,
      active: () => runtime.result().snapshot.active
    },
    commit: {
      actions: (actions: readonly Action[]) => dispatch(actions),
      replace: (nextDocument: DataDoc) => write.load(document.clone(nextDocument)),
      undo: write.history.undo,
      redo: write.history.redo,
      clearHistory: write.history.clear
    },
    history: {
      state: write.history.state,
      canUndo: write.history.canUndo,
      canRedo: write.history.canRedo
    },
    subscribe: runtime.subscribe
  } satisfies Engine['core']

  const readApi = createEngineReadApi(core)
  const fields = createFieldsApi({
    document: core.read.document,
    dispatch
  })
  const records = createRecordsApi({
    document: core.read.document,
    dispatch
  })
  const active = createActiveViewApi({
    document: core.read.document,
    core,
    dispatch
  })
  const views = createViewsApi({
    document: core.read.document,
    dispatch
  })

  return {
    core,
    read: readApi,
    active,
    views,
    fields,
    records,
    document: {
      export: () => document.clone(core.read.document()),
      replace: (nextDocument: DataDoc) => {
        core.commit.replace(document.clone(nextDocument))
        return document.clone(core.read.document())
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
