import { createResetCommitImpact } from '@dataview/core/commit/impact'
import type { DataDoc } from '@dataview/core/contracts'
import {
  createValueStore,
  type ValueStore
} from '@shared/core'
import { resolveViewDemand } from '@dataview/engine/active/demand'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import { createViewRuntime } from '@dataview/engine/active/runtime'
import type { EngineRuntimeState } from '@dataview/engine/runtime/state'

export type RuntimeStore = ValueStore<EngineRuntimeState>
export type { EngineRuntimeState } from '@dataview/engine/runtime/state'

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
    impact: createResetCommitImpact(undefined, input.doc),
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
