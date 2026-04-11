import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  ResolvedWriteBatch
} from '../command'
import type {
  HistoryState
} from '../history'
import type {
  PerfRuntime
} from '../perf/runtime'
import type {
  Store
} from '../state/store'
import type {
  CommandResult,
  CommitResult
} from '../types'
import {
  commit
} from './commit'
import {
  canRedo,
  canUndo,
  clearHistory,
  historyState
} from './history'
import {
  createPlanApi
} from './plan'

export interface WriteControl {
  run: (batch: ResolvedWriteBatch) => CommandResult
  undo: () => CommitResult
  redo: () => CommitResult
  load: (doc: DataDoc) => CommitResult
  history: {
    state: () => HistoryState
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
  }
}

export const createWriteControl = (input: {
  store: Store
  perf: PerfRuntime
  capturePerf: boolean
}): WriteControl => {
  const plan = createPlanApi()
  const run = (batch: ResolvedWriteBatch): CommandResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: plan.write(batch)
  })
  const undo = (): CommitResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: plan.undo()
  })
  const redo = (): CommitResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: plan.redo()
  })
  const load = (doc: DataDoc): CommitResult => commit({
    store: input.store,
    perf: input.perf,
    capturePerf: input.capturePerf,
    plan: plan.load(doc)
  })

  return {
    run,
    undo,
    redo,
    load,
    history: {
      state: () => historyState(input.store.get().history),
      canUndo: () => canUndo(input.store.get().history),
      canRedo: () => canRedo(input.store.get().history),
      clear: () => {
        const current = input.store.get()
        if (!current.history.undo.length && !current.history.redo.length) {
          return
        }
        input.store.set({
          ...current,
          history: clearHistory(current.history)
        })
      }
    }
  }
}
