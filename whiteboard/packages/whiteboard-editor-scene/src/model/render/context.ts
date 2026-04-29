import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { Input } from '../../contracts/editor'
import type {
  WhiteboardExecution
} from '../../contracts/execution'
import {
  executionScopeHasAny
} from '../../contracts/execution'
import type { WorkingState } from '../../contracts/working'
import {
  appendEdgeItemScope,
  appendMindmapNodeScope,
  appendScopeIds
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
  execution: WhiteboardExecution
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
  execution: WhiteboardExecution
  working: WorkingState
  reset: boolean
}): RenderContext => {
  const active = readActiveEdgeIds(input.current)
  const node = new Set<NodeId>()
  const statics = new Set<EdgeId>()
  const labels = new Set<EdgeId>()
  const masks = new Set<EdgeId>()
  const activeEdge = new Set<EdgeId>([
    ...active,
    ...input.working.render.active.keys()
  ])

  appendScopeIds(node, input.execution.graph.node.entity, () => input.working.graph.nodes.keys())
  appendScopeIds(node, input.execution.graph.node.geometry, () => input.working.graph.nodes.keys())
  appendScopeIds(node, input.execution.graph.node.content, () => input.working.graph.nodes.keys())
  appendScopeIds(node, input.execution.graph.node.owner, () => input.working.graph.nodes.keys())
  appendScopeIds(node, input.execution.ui.node, () => input.working.graph.nodes.keys())
  appendMindmapNodeScope({
    target: node,
    scope: input.execution.graph.mindmap.entity,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: input.execution.graph.mindmap.geometry,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: input.execution.graph.mindmap.owner,
    working: input.working
  })

  appendScopeIds(statics, input.execution.graph.edge.entity, () => input.working.graph.edges.keys())
  appendScopeIds(statics, input.execution.graph.edge.geometry, () => input.working.graph.edges.keys())
  appendScopeIds(statics, input.execution.graph.edge.content, () => input.working.graph.edges.keys())
  appendEdgeItemScope({
    target: statics,
    scope: input.execution.items,
    working: input.working
  })

  appendScopeIds(labels, input.execution.graph.edge.entity, () => input.working.graph.edges.keys())
  appendScopeIds(labels, input.execution.graph.edge.geometry, () => input.working.graph.edges.keys())
  appendScopeIds(labels, input.execution.graph.edge.content, () => input.working.graph.edges.keys())
  appendScopeIds(labels, input.execution.ui.edge, () => input.working.graph.edges.keys())

  appendScopeIds(masks, input.execution.graph.edge.entity, () => input.working.graph.edges.keys())
  appendScopeIds(masks, input.execution.graph.edge.geometry, () => input.working.graph.edges.keys())
  appendScopeIds(masks, input.execution.graph.edge.content, () => input.working.graph.edges.keys())

  appendScopeIds(activeEdge, input.execution.graph.edge.entity, () => input.working.graph.edges.keys())
  appendScopeIds(activeEdge, input.execution.graph.edge.geometry, () => input.working.graph.edges.keys())
  appendScopeIds(activeEdge, input.execution.graph.edge.content, () => input.working.graph.edges.keys())
  appendScopeIds(activeEdge, input.execution.ui.edge, () => input.working.graph.edges.keys())

  return {
    current: input.current,
    execution: input.execution,
    reset: input.reset,
    working: input.working,
    active,
    touched: {
      node,
      edge: {
        statics,
        active: activeEdge,
        labels,
        masks
      },
      overlay: (
        input.reset
        || input.execution.runtime.ui
        || input.execution.ui.chrome
        || executionScopeHasAny(input.execution.ui.edge)
        || executionScopeHasAny(input.execution.graph.edge.entity)
        || executionScopeHasAny(input.execution.graph.edge.geometry)
        || executionScopeHasAny(input.execution.graph.edge.content)
      ),
      chrome: input.reset || input.execution.ui.chrome
    }
  }
}
