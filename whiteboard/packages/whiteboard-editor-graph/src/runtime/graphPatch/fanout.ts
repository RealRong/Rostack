import type {
  CanvasItemRef,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type { GraphPatchScope } from '../../contracts/delta'
import type { GraphState } from '../../contracts/working'

export interface GraphPatchQueue {
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  mindmaps: Set<MindmapId>
  groups: Set<GroupId>
}

export const createGraphPatchQueue = (): GraphPatchQueue => ({
  nodes: new Set(),
  edges: new Set(),
  mindmaps: new Set(),
  groups: new Set()
})

const enqueueAll = <TId extends string>(
  target: Set<TId>,
  values: Iterable<TId>
) => {
  for (const value of values) {
    target.add(value)
  }
}

const isItemRefEqual = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

export const collectRelatedEdges = (
  snapshot: document.Snapshot,
  nodeId: NodeId
): readonly EdgeId[] => {
  const related: EdgeId[] = []

  snapshot.state.facts.relations.edgeNodes.forEach((nodes, edgeId) => {
    if (nodes.source === nodeId || nodes.target === nodeId) {
      related.push(edgeId)
    }
  })

  return related
}

export const collectContainingGroups = (
  snapshot: document.Snapshot,
  item: CanvasItemRef
): readonly GroupId[] => {
  const groups: GroupId[] = []

  snapshot.state.facts.relations.groupItems.forEach((items, groupId) => {
    if (items.some((candidate) => isItemRefEqual(candidate, item))) {
      groups.push(groupId)
    }
  })

  return groups
}

export const seedGraphPatchQueue = (input: {
  snapshot: document.Snapshot
  working: GraphState
  scope: GraphPatchScope
  queue: GraphPatchQueue
}) => {
  if (input.scope.reset) {
    enqueueAll(input.queue.nodes, input.snapshot.state.facts.entities.nodes.keys())
    enqueueAll(input.queue.nodes, input.working.nodes.keys())
    enqueueAll(input.queue.edges, input.snapshot.state.facts.entities.edges.keys())
    enqueueAll(input.queue.edges, input.working.edges.keys())
    enqueueAll(
      input.queue.mindmaps,
      input.snapshot.state.facts.entities.owners.mindmaps.keys()
    )
    enqueueAll(input.queue.mindmaps, input.working.owners.mindmaps.keys())
    enqueueAll(
      input.queue.groups,
      input.snapshot.state.facts.entities.owners.groups.keys()
    )
    enqueueAll(input.queue.groups, input.working.owners.groups.keys())
    return
  }

  enqueueAll(input.queue.nodes, input.scope.nodes)
  enqueueAll(input.queue.edges, input.scope.edges)
  enqueueAll(input.queue.mindmaps, input.scope.mindmaps)
  enqueueAll(input.queue.groups, input.scope.groups)
}

export const preFanoutSeeds = (input: {
  snapshot: document.Snapshot
  working: GraphState
  scope: GraphPatchScope
  queue: GraphPatchQueue
}) => {
  if (input.scope.reset) {
    return
  }

  input.scope.nodes.forEach((nodeId) => {
    const nextOwner = input.snapshot.state.facts.relations.nodeOwner.get(nodeId)
    const previousOwner = input.working.nodes.get(nodeId)?.base.owner

    if (nextOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(nextOwner.id)
    }
    if (previousOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(previousOwner.id)
    }

    fanoutNodeGeometry({
      snapshot: input.snapshot,
      queue: input.queue,
      nodeId
    })
  })
}

export const fanoutNodeGeometry = (input: {
  snapshot: document.Snapshot
  queue: GraphPatchQueue
  nodeId: NodeId
}) => {
  enqueueAll(input.queue.edges, collectRelatedEdges(input.snapshot, input.nodeId))
  enqueueAll(input.queue.groups, collectContainingGroups(input.snapshot, {
    kind: 'node',
    id: input.nodeId
  }))
}

export const fanoutMindmapGeometry = (input: {
  snapshot: document.Snapshot
  queue: GraphPatchQueue
  mindmapId: MindmapId
}) => {
  enqueueAll(input.queue.groups, collectContainingGroups(input.snapshot, {
    kind: 'mindmap',
    id: input.mindmapId
  }))
}
