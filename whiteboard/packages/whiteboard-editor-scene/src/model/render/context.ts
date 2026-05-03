import type { Input } from '../../contracts/editor'
import type {
  EditorSceneRenderFacts
} from '../../contracts/facts'
import type { WorkingState } from '../../contracts/working'
import {
  resolveScope
} from '../scope'

export interface RenderContext {
  current: Input
  facts: EditorSceneRenderFacts
  reset: boolean
  working: WorkingState
  active: ReadonlySet<string>
  touched: {
    node: ReadonlySet<string>
    edge: {
      statics: ReadonlySet<string>
      active: ReadonlySet<string>
      labels: ReadonlySet<string>
      masks: ReadonlySet<string>
    }
    overlay: boolean
    chrome: boolean
  }
}

export const createRenderContext = (input: {
  current: Input
  facts: EditorSceneRenderFacts
  working: WorkingState
  reset: boolean
}): RenderContext => {
  return {
    current: input.current,
    facts: input.facts,
    reset: input.reset,
    working: input.working,
    active: input.working.runtime.editor.facts.activeEdgeIds,
    touched: {
      node: resolveScope(input.facts.node, () => input.working.graph.nodes.keys()),
      edge: {
        statics: resolveScope(
          input.facts.edgeStatics,
          () => input.working.graph.edges.keys()
        ),
        active: resolveScope(
          input.facts.edgeActive,
          () => input.working.graph.edges.keys()
        ),
        labels: resolveScope(
          input.facts.edgeLabels,
          () => input.working.graph.edges.keys()
        ),
        masks: resolveScope(
          input.facts.edgeMasks,
          () => input.working.graph.edges.keys()
        )
      },
      overlay: input.facts.chromeEdge,
      chrome: input.facts.chromeScene
    }
  }
}
