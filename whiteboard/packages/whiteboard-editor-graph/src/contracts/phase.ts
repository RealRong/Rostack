import type * as document from '@whiteboard/engine/contracts/document'
import type * as editor from './editor'
import type { Action, Flags } from './core'

export type Name =
  | 'input'
  | 'graph'
  | 'measure'
  | 'structure'
  | 'tree'
  | 'element'
  | 'selection'
  | 'chrome'
  | 'scene'
  | 'publish'

export interface Spec {
  name: Name
  deps: readonly Name[]
  run(context: Context): Result
}

export interface Context {
  document: document.Snapshot
  input: editor.Input
  working: Working
  previous?: editor.Snapshot
}

export interface Working {
  graph: {
    nodes: ReadonlyMap<string, unknown>
    edges: ReadonlyMap<string, unknown>
  }
  scene: {
    items: readonly editor.SceneItem[]
  }
}

export interface Result {
  action: Action
  change: Change
  metrics?: Metrics
}

export interface Change {
  graph: editor.GraphChange
  scene: Flags
  ui: editor.UiChange
}

export interface Metrics {
  inputCount?: number
  outputCount?: number
  reusedCount?: number
  rebuiltCount?: number
  durationMs?: number
}
