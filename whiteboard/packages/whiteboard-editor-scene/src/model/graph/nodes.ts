import type { NodeId } from '@whiteboard/core/types'
import { patchNode } from './node'
import type { GraphContext } from './context'
import { drainQueue, fanoutNodeGeometry } from './queue'

export const patchGraphNodes = (
  context: GraphContext
): number => {
  const deferred = new Set<NodeId>()
  let count = 0

  drainQueue(context.queue.node).forEach((nodeId) => {
    const owner = context.working.indexes.ownerByNode.get(nodeId)
      ?? context.working.graph.nodes.get(nodeId)?.base.owner
    if (owner?.kind === 'mindmap') {
      deferred.add(nodeId)
      return
    }

    const result = patchNode({
      input: context.current,
      working: context.working,
      delta: context.working.phase.graph,
      nodeId
    })
    if (result.changed) {
      count += 1
    }
    if (result.geometryChanged) {
      fanoutNodeGeometry({
        working: context.working,
        owner: result.owner,
        queue: context.queue,
        nodeId
      })
    }
  })

  deferred.forEach((nodeId) => {
    context.queue.node.add(nodeId)
  })

  return count
}

export const patchGraphMindmapNodes = (
  context: GraphContext
): number => {
  let count = 0

  drainQueue(context.queue.node).forEach((nodeId) => {
    const result = patchNode({
      input: context.current,
      working: context.working,
      delta: context.working.phase.graph,
      nodeId
    })
    if (result.changed) {
      count += 1
    }
    if (result.geometryChanged) {
      fanoutNodeGeometry({
        working: context.working,
        owner: result.owner,
        queue: context.queue,
        nodeId
      })
    }
  })

  return count
}
