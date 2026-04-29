import type { NodeId } from '@whiteboard/core/types'
import { patchEdge, type EdgeNodeSnapshot } from './edge'
import type { GraphContext } from './context'
import { drainQueue } from './queue'

export const patchGraphEdges = (
  context: GraphContext
): number => {
  let count = 0
  const nodeSnapshotCache = new Map<NodeId, EdgeNodeSnapshot>()

  drainQueue(context.queue.edge).forEach((edgeId) => {
    if (patchEdge({
      input: context.current,
      working: context.working,
      delta: context.working.delta.graph,
      edgeId,
      nodeSnapshotCache
    }).changed) {
      count += 1
    }
  })

  return count
}
