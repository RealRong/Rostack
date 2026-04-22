import { impact } from '@dataview/core/commit/impact'
import type { DataDoc } from '@dataview/core/contracts'
import { resolveViewPlan } from '@dataview/engine/active/plan'
import { emptyNormalizedIndexDemand } from '@dataview/engine/active/index/demand'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import { createViewRuntime } from '@dataview/engine/active/runtime'
import { createBaseImpact } from '@dataview/engine/active/shared/baseImpact'
import type {
  EngineResult,
  EngineSnapshot
} from '@dataview/engine/contracts/core'
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'
import type {
  EngineState
} from '@dataview/engine/runtime/state'

export interface CoreRuntime {
  state: () => EngineState
  result: () => EngineResult
  updateState: (next: EngineState) => void
  commit: (next: {
    state: EngineState
    result: EngineResult
  }) => void
  subscribe: (listener: (result: EngineResult) => void) => () => void
}

export const createEngineSnapshot = (
  state: EngineState
): EngineSnapshot => ({
  doc: state.doc,
  ...(state.active.snapshot
    ? {
        active: state.active.snapshot
      }
    : {})
})

export const createInitialEngineState = (input: {
  doc: DataDoc
  historyCap: number
  capturePerf: boolean
}): EngineState => {
  const documentContext = createStaticDocumentReadContext(input.doc)
  const plan = resolveViewPlan(documentContext, documentContext.activeViewId)
  const index = createIndexState(input.doc, plan?.index ?? emptyNormalizedIndexDemand())
  const resetImpact = impact.reset(undefined, input.doc)
  const currentView = createViewRuntime({
    documentContext,
    viewPlan: plan,
    index,
    impact: createBaseImpact(resetImpact),
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
    active: {
      ...(plan
        ? { plan }
        : {}),
      index,
      cache: currentView.cache,
      ...(currentView.snapshot
        ? { snapshot: currentView.snapshot }
        : {})
    }
  }
}

export const createCoreRuntime = (
  initial: EngineState
): CoreRuntime => {
  let state = initial
  let result: EngineResult = {
    rev: initial.rev,
    snapshot: createEngineSnapshot(initial)
  }
  const listeners = new Set<(result: EngineResult) => void>()

  return {
    state: () => state,
    result: () => result,
    updateState: next => {
      state = next
    },
    commit: next => {
      state = next.state
      result = next.result
      listeners.forEach(listener => {
        listener(result)
      })
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
