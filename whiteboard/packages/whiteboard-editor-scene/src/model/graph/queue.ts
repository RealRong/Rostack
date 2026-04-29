import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { WorkingState } from '../../contracts/working'
import { readRelatedEdgeIds } from '../index/read'
import { appendIds } from '../scope'
import type { GraphContext } from './context'

export interface GraphQueue {
  node: Set<NodeId>
  edge: Set<EdgeId>
  mindmap: Set<MindmapId>
  group: Set<GroupId>
}

export const createGraphQueue = (): GraphQueue => ({
  node: new Set(),
  edge: new Set(),
  mindmap: new Set(),
  group: new Set()
})

export const drainQueue = <TId extends string>(
  queue: Set<TId>
): readonly TId[] => {
  const ids = [...queue]
  queue.clear()
  return ids
}

export const fanoutNodeGeometry = (input: {
  working: WorkingState
  owner?: {
    kind: 'mindmap' | 'group'
    id: string
  }
  queue: GraphQueue
  nodeId: NodeId
}) => {
  appendIds(
    input.queue.edge,
    readRelatedEdgeIds(input.working.indexes, [input.nodeId])
  )
  if (input.owner?.kind === 'group') {
    input.queue.group.add(input.owner.id as GroupId)
  }
}

export const seedGraphQueue = (
  context: GraphContext
) => {
  appendIds(context.queue.node, context.target.node)
  appendIds(context.queue.edge, context.target.edge)
  appendIds(context.queue.mindmap, context.target.mindmap)
  appendIds(context.queue.group, context.target.group)
}

export const seedGraphFanout = (
  context: GraphContext
) => {
  context.target.node.forEach((nodeId) => {
    const nextOwner = context.working.indexes.ownerByNode.get(nodeId)
    const previousOwner = context.working.graph.nodes.get(nodeId)?.base.owner

    if (nextOwner?.kind === 'mindmap') {
      context.queue.mindmap.add(nextOwner.id)
    }
    if (previousOwner?.kind === 'mindmap') {
      context.queue.mindmap.add(previousOwner.id)
    }

    fanoutNodeGeometry({
      working: context.working,
      owner: nextOwner,
      queue: context.queue,
      nodeId
    })
    if (previousOwner?.kind === 'group') {
      context.queue.group.add(previousOwner.id)
    }
  })
}
