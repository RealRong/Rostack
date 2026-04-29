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

const readActiveEdgeIds = (
  current: Input
): ReadonlySet<EdgeId> => {
  const edgeIds = new Set<EdgeId>()
  current.runtime.interaction.selection.edgeIds.forEach((edgeId) => {
    edgeIds.add(edgeId)
  })
  if (current.runtime.interaction.hover.kind === 'edge') {
    edgeIds.add(current.runtime.interaction.hover.edgeId)
  }
  if (current.runtime.session.edit?.kind === 'edge-label') {
    edgeIds.add(current.runtime.session.edit.edgeId)
  }
  return edgeIds
}

export interface RenderContext {
  current: Input
  plan: EditorScenePlan
  reset: boolean
  working: WorkingState
  active: ReadonlySet<EdgeId>
  touched: {
    node: ReadonlySet<NodeId>
    edge: {
      statics: ReadonlySet<EdgeId>
      active: ReadonlySet<EdgeId>
      labels: ReadonlySet<EdgeId>
      masks: ReadonlySet<EdgeId>
    }
    overlay: boolean
    chrome: boolean
  }
}

export const createRenderContext = (input: {
  current: Input
  plan: EditorScenePlan
  working: WorkingState
  reset: boolean
}): RenderContext => {
  return {
    current: input.current,
    plan: input.plan,
    reset: input.reset,
    working: input.working,
    active: readActiveEdgeIds(input.current),
    touched: {
      node: resolveScope(input.plan.render.node, () => input.working.graph.nodes.keys()) as ReadonlySet<NodeId>,
      edge: {
        statics: resolveScope(
          input.plan.render.edgeStatics,
          () => input.working.graph.edges.keys()
        ) as ReadonlySet<EdgeId>,
        active: resolveScope(
          input.plan.render.edgeActive,
          () => input.working.graph.edges.keys()
        ) as ReadonlySet<EdgeId>,
        labels: resolveScope(
          input.plan.render.edgeLabels,
          () => input.working.graph.edges.keys()
        ) as ReadonlySet<EdgeId>,
        masks: resolveScope(
          input.plan.render.edgeMasks,
          () => input.working.graph.edges.keys()
        ) as ReadonlySet<EdgeId>
      },
      overlay: input.plan.render.chromeEdge,
      chrome: input.plan.render.chromeScene
    }
  }
}
