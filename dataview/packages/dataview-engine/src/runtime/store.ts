import { createResetDelta } from '@dataview/core/commit/delta'
import type { DataDoc } from '@dataview/core/contracts'
import {
  createValueStore,
  type ValueStore
} from '@shared/core'
import { resolveViewDemand } from '#engine/active/demand.ts'
import { createIndexState } from '#engine/active/index/runtime.ts'
import { createViewRuntime } from '#engine/active/runtime.ts'
import type { EngineRuntimeState } from '#engine/runtime/state.ts'

export type RuntimeStore = ValueStore<EngineRuntimeState>
export type { EngineRuntimeState } from '#engine/runtime/state.ts'

export const createRuntimeState = (input: {
  doc: DataDoc
  historyCap: number
  capturePerf: boolean
}): EngineRuntimeState => {
  // The engine maintains exactly one derived runtime for the current active view.
  // Inactive views keep only document config and are rebuilt on demand when opened.
  const demand = resolveViewDemand(input.doc, input.doc.activeViewId)
  const index = createIndexState(input.doc, demand)
  const currentView = createViewRuntime({
    doc: input.doc,
    index: index.state,
    delta: createResetDelta(undefined, input.doc),
    capturePerf: input.capturePerf
  })

  return {
    rev: 0,
    doc: input.doc,
    history: {
      cap: input.historyCap,
      undo: [],
      redo: []
    },
    currentView: {
      demand: index.demand,
      index: index.state,
      cache: currentView.cache,
      ...(currentView.snapshot
        ? { snapshot: currentView.snapshot }
        : {})
    }
  }
}

export const createStore = (
  initial: EngineRuntimeState
): RuntimeStore => createValueStore<EngineRuntimeState>({
  initial
})
