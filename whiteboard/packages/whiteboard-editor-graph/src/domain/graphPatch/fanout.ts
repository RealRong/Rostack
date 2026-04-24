import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type { GraphPatchScope } from '../../contracts/delta'
import type {
  GraphState,
  IndexState
} from '../../contracts/working'
import { readRelatedEdgeIds } from '../indexes'
import { readGraphPatchScopeKeys } from '../../projector/scopes/graphScope'

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

export const collectRelatedEdges = (
  indexes: Pick<IndexState, 'edgeIdsByNode'>,
  nodeId: NodeId
): readonly EdgeId[] => readRelatedEdgeIds(indexes, [nodeId])

export const seedGraphPatchQueue = (input: {
  snapshot: document.Snapshot
  working: GraphState
  scope: GraphPatchScope
  queue: GraphPatchQueue
}) => {
  if (input.scope.reset) {
    enqueueAll(input.queue.nodes, Object.keys(input.snapshot.document.nodes) as readonly NodeId[])
    enqueueAll(input.queue.nodes, input.working.nodes.keys())
    enqueueAll(input.queue.edges, Object.keys(input.snapshot.document.edges) as readonly EdgeId[])
    enqueueAll(input.queue.edges, input.working.edges.keys())
    enqueueAll(
      input.queue.mindmaps,
      Object.keys(input.snapshot.document.mindmaps) as readonly MindmapId[]
    )
    enqueueAll(input.queue.mindmaps, input.working.owners.mindmaps.keys())
    enqueueAll(
      input.queue.groups,
      Object.keys(input.snapshot.document.groups) as readonly GroupId[]
    )
    enqueueAll(input.queue.groups, input.working.owners.groups.keys())
    return
  }

  enqueueAll(input.queue.nodes, readGraphPatchScopeKeys(input.scope.nodes))
  enqueueAll(input.queue.edges, readGraphPatchScopeKeys(input.scope.edges))
  enqueueAll(input.queue.mindmaps, readGraphPatchScopeKeys(input.scope.mindmaps))
  enqueueAll(input.queue.groups, readGraphPatchScopeKeys(input.scope.groups))
}

export const preFanoutSeeds = (input: {
  indexes: Pick<IndexState, 'ownerByNode' | 'edgeIdsByNode'>
  working: GraphState
  scope: GraphPatchScope
  queue: GraphPatchQueue
}) => {
  if (input.scope.reset) {
    return
  }

  readGraphPatchScopeKeys(input.scope.nodes).forEach((nodeId) => {
    const nextOwner = input.indexes.ownerByNode.get(nodeId)
    const previousOwner = input.working.nodes.get(nodeId)?.base.owner

    if (nextOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(nextOwner.id)
    }
    if (previousOwner?.kind === 'mindmap') {
      input.queue.mindmaps.add(previousOwner.id)
    }

    fanoutNodeGeometry({
      indexes: input.indexes,
      owner: nextOwner,
      queue: input.queue,
      nodeId
    })
  })
}

export const fanoutNodeGeometry = (input: {
  indexes: Pick<IndexState, 'edgeIdsByNode'>
  owner?: {
    kind: 'mindmap' | 'group'
    id: string
  }
  queue: GraphPatchQueue
  nodeId: NodeId
}) => {
  enqueueAll(input.queue.edges, collectRelatedEdges(input.indexes, input.nodeId))
  if (input.owner?.kind === 'group') {
    input.queue.groups.add(input.owner.id as GroupId)
  }
}

export const fanoutMindmapGeometry = (input: {
  queue: GraphPatchQueue
  mindmapId: MindmapId
}) => {
  void input.queue
  void input.mindmapId
}
