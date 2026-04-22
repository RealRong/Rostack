import type { DataDoc } from '@dataview/core/contracts'
import { resolveViewPlan } from '@dataview/engine/active/plan'
import { emptyNormalizedIndexDemand } from '@dataview/engine/active/index/demand'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import type {
  ActiveSnapshot,
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
  input: {
    state: EngineState
    active?: ActiveSnapshot
  }
): EngineSnapshot => ({
  doc: input.state.doc,
  ...(input.active
    ? {
        active: input.active
      }
    : {})
})

export const createInitialEngineState = (input: {
  doc: DataDoc
  historyCap: number
}): EngineState => {
  const documentContext = createStaticDocumentReadContext(input.doc)
  const plan = resolveViewPlan(documentContext, documentContext.activeViewId)
  const index = createIndexState(input.doc, plan?.index ?? emptyNormalizedIndexDemand())

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
      index
    }
  }
}

export const createCoreRuntime = (
  initial: {
    state: EngineState
    result?: EngineResult
  }
): CoreRuntime => {
  let state = initial.state
  let result: EngineResult = initial.result ?? {
    rev: initial.state.rev,
    snapshot: createEngineSnapshot({
      state: initial.state
    })
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
