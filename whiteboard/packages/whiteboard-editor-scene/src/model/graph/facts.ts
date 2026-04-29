import { idDelta } from '@shared/delta'
import {
  createEmptyWhiteboardGraphFacts,
  executionScopeFromValues,
  executionScopeHasAny,
  executionScopeUnion,
  type ExecutionScope,
  type WhiteboardGraphFacts
} from '../../contracts/execution'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { WorkingState } from '../../contracts/working'
import type { GraphContext } from './context'

const scopeFromTouchedIds = <TId extends string>(
  ids: ReadonlySet<TId> | 'all'
): ExecutionScope<TId> => ids === 'all'
  ? 'all'
  : new Set(ids)

export const buildGraphFacts = (
  context: GraphContext
): WhiteboardGraphFacts => {
  if (context.reset) {
    return {
      node: {
        entity: 'all',
        geometry: 'all',
        content: 'all',
        owner: 'all'
      },
      edge: {
        entity: 'all',
        geometry: 'all',
        content: 'all'
      },
      mindmap: {
        entity: 'all',
        geometry: 'all',
        owner: 'all'
      },
      group: {
        entity: 'all',
        geometry: 'all',
        owner: 'all'
      }
    }
  }

  const facts = createEmptyWhiteboardGraphFacts()
  const graphDelta = context.working.delta.graph
  const editingNode = context.current.runtime.session.edit?.kind === 'node'
    ? executionScopeFromValues([context.current.runtime.session.edit.nodeId])
    : new Set<NodeId>()
  const editingEdge = context.current.runtime.session.edit?.kind === 'edge-label'
    ? executionScopeFromValues([context.current.runtime.session.edit.edgeId])
    : new Set<EdgeId>()

  facts.node.entity = idDelta.touched(graphDelta.entities.nodes)
  facts.edge.entity = idDelta.touched(graphDelta.entities.edges)
  facts.mindmap.entity = idDelta.touched(graphDelta.entities.mindmaps)
  facts.group.entity = idDelta.touched(graphDelta.entities.groups)

  facts.node.geometry = executionScopeFromValues(graphDelta.geometry.nodes)
  facts.edge.geometry = executionScopeFromValues(graphDelta.geometry.edges)
  facts.mindmap.geometry = executionScopeFromValues(graphDelta.geometry.mindmaps)
  facts.group.geometry = executionScopeFromValues(graphDelta.geometry.groups)

  facts.node.content = executionScopeUnion(
    scopeFromTouchedIds(context.current.delta.node.content.touchedIds()),
    editingNode
  )
  facts.edge.content = executionScopeUnion(
    scopeFromTouchedIds(context.current.delta.edge.labels.touchedIds()),
    scopeFromTouchedIds(context.current.delta.edge.style.touchedIds()),
    scopeFromTouchedIds(context.current.delta.edge.data.touchedIds()),
    editingEdge
  )

  facts.node.owner = scopeFromTouchedIds(context.current.delta.node.owner.touchedIds())
  facts.mindmap.owner = scopeFromTouchedIds(context.current.delta.mindmap.structure.touchedIds())
  facts.group.owner = scopeFromTouchedIds(context.current.delta.group.value.touchedIds())

  return facts
}

export const hasGraphEntityLifecycle = (working: WorkingState) => {
  const { entities } = working.delta.graph
  return (
    entities.nodes.added.size > 0
    || entities.nodes.removed.size > 0
    || entities.edges.added.size > 0
    || entities.edges.removed.size > 0
    || entities.mindmaps.added.size > 0
    || entities.mindmaps.removed.size > 0
    || entities.groups.added.size > 0
    || entities.groups.removed.size > 0
  )
}

export const graphSpatialChanged = (
  context: GraphContext
): boolean => (
  context.reset
  || context.target.order
  || hasGraphEntityLifecycle(context.working)
  || executionScopeHasAny(context.execution.graph.node.geometry)
  || executionScopeHasAny(context.execution.graph.edge.geometry)
  || executionScopeHasAny(context.execution.graph.mindmap.geometry)
  || executionScopeHasAny(context.execution.graph.group.geometry)
)
