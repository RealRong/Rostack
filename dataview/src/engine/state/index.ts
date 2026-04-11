import {
  createResetDelta
} from '@dataview/core/commit/delta'
import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  BaseOperation
} from '@dataview/core/contracts/operations'
import {
  createValueStore
} from '@shared/store'
import {
  createIndexState
} from '../derive/index'
import {
  createProjectState
} from '../derive/project'
import {
  type NormalizedIndexDemand
} from '../index/demand'
import type {
  IndexState
} from '../index/types'
import {
  resolveIndexDemand
} from '../project/runtime/demand'
import type {
  ProjectionState,
  ProjectState
} from '../project/runtime/state'

export interface HistoryEntry {
  undo: BaseOperation[]
  redo: BaseOperation[]
}

export interface History {
  cap: number
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

export interface State {
  rev: number
  doc: DataDoc
  history: History
  index: IndexState
  project: ProjectState
  cache: {
    indexDemand: NormalizedIndexDemand
    projection: ProjectionState
  }
}

export interface Store {
  get: () => State
  set: (next: State) => void
  update: (recipe: (previous: State) => State) => void
  sub: (fn: () => void) => () => void
}

export const createInitialState = (input: {
  doc: DataDoc
  historyCap: number
  capturePerf: boolean
}): State => {
  const demand = resolveIndexDemand(input.doc, input.doc.activeViewId)
  const index = createIndexState(input.doc, demand)
  const project = createProjectState({
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
    index: index.state,
    project: project.state,
    cache: {
      indexDemand: index.demand,
      projection: project.projection
    }
  }
}

export const createStore = (
  initial: State
): Store => {
  const store = createValueStore<State>({
    initial
  })

  return {
    get: store.get,
    set: store.set,
    update: store.update,
    sub: store.subscribe
  }
}
