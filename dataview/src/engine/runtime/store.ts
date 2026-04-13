import { createResetDelta } from '@dataview/core/commit/delta'
import type { DataDoc } from '@dataview/core/contracts'
import {
  createValueStore,
  type ValueStore
} from '@shared/core'
import type { EngineState } from '../contracts/internal'
import { createIndexState } from '../index/runtime'
import { resolveViewDemand } from '../derive/active/demand'
import { createViewRuntime } from '../derive/active/runtime'

export type Store = ValueStore<EngineState>
export type { EngineState } from '../contracts/internal'

export const createInitialState = (input: {
  doc: DataDoc
  historyCap: number
  capturePerf: boolean
}): EngineState => {
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
  initial: EngineState
): Store => createValueStore<EngineState>({
  initial
})
