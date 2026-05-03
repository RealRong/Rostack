import type { Input } from '../../contracts/editor'
import type {
  EditorSceneUiFacts
} from '../../contracts/facts'
import type { WorkingState } from '../../contracts/working'
import {
  resolveScope
} from '../scope'

export interface UiContext {
  current: Input
  facts: EditorSceneUiFacts
  reset: boolean
  working: WorkingState
  touched: {
    node: ReadonlySet<string>
    edge: ReadonlySet<string>
    chrome: boolean
  }
}

export const createUiContext = (input: {
  current: Input
  facts: EditorSceneUiFacts
  working: WorkingState
  reset: boolean
}): UiContext => {
  return {
    current: input.current,
    facts: input.facts,
    reset: input.reset,
    working: input.working,
    touched: {
      node: resolveScope(input.facts.node, () => input.working.graph.nodes.keys()),
      edge: resolveScope(input.facts.edge, () => input.working.graph.edges.keys()),
      chrome: input.facts.chrome
    }
  }
}
