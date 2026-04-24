import type {
  Action,
  DocumentOperation,
  DataDoc
} from '@dataview/core/contracts'
import { impact } from '@dataview/core/commit/impact'
import { document } from '@dataview/core/document'
import { createBaseImpact } from '@dataview/engine/active/shared/baseImpact'
import type {
  ApplyOptions,
  CreateEngineOptions,
  Engine,
  ExecuteOptions
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
import { createEngineHistory } from '@dataview/engine/runtime/history'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = document.clone(options.document)
  const performance = createPerformanceRuntime(options.performance)
  const capturePerformance = Boolean(options.performance?.traces || options.performance?.stats)
  const activeRuntime = createActiveRuntime()
  const initialState = createInitialEngineState({
    doc: initialDocument
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
  const execute = (
    action: Action | readonly Action[],
    options?: ExecuteOptions
  ) => {
    const actions = Array.isArray(action)
      ? action
      : [action]
    if (!capturePerformance) {
      return write.execute(planActions({
        document: runtime.state().doc,
        actions
      }), options)
    }

    const planStart = now()
    const batch = planActions({
      document: runtime.state().doc,
      actions
    })

    return write.execute({
      ...batch,
      planMs: now() - planStart
    }, options)
  }
  const apply = (
    operations: readonly DocumentOperation[],
    options?: ApplyOptions
  ) => write.apply(operations, options)
  const history = createEngineHistory({
    capacity: historyCapacity,
    writes: write.writes,
    replay: write.replay
  })
  const readDocument = () => runtime.result().snapshot.doc
  const readActiveState = () => runtime.result().snapshot.active
  const fields = createFieldsApi({
    document: readDocument,
    dispatch: execute
  })
  const records = createRecordsApi({
    document: readDocument,
    dispatch: execute
  })
  const active = createActiveViewApi({
    document: readDocument,
    active: readActiveState,
    dispatch: execute
  })
  const views = createViewsApi({
    document: readDocument,
    dispatch: execute
  })

  return {
    result: runtime.result,
    subscribe: runtime.subscribe,
    writes: write.writes,
    active,
    views,
    fields,
    records,
    execute,
    apply,
    document: {
      get: () => document.clone(readDocument()),
      replace: (nextDocument: DataDoc) => {
        write.load(document.clone(nextDocument))
        return document.clone(readDocument())
      }
    },
    history,
    performance: performance.api
  }
}
