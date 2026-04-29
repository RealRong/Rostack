import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../../contracts/editor'
import type {
  EditorScenePlan
} from '../../contracts/plan'
import type { WorkingState } from '../../contracts/working'
import {
  resolveScope
} from '../scope'

export interface UiContext {
  current: Input
  plan: EditorScenePlan
  reset: boolean
  working: WorkingState
  touched: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    chrome: boolean
  }
}

export const createUiContext = (input: {
  current: Input
  plan: EditorScenePlan
  working: WorkingState
  reset: boolean
}): UiContext => {
  return {
    current: input.current,
    plan: input.plan,
    reset: input.reset,
    working: input.working,
    touched: {
      node: resolveScope(input.plan.ui.node, () => input.working.graph.nodes.keys()) as ReadonlySet<NodeId>,
      edge: resolveScope(input.plan.ui.edge, () => input.working.graph.edges.keys()) as ReadonlySet<EdgeId>,
      chrome: input.plan.ui.chrome
    }
  }
}
