import { patchMindmap } from './mindmap'
import type { GraphContext } from './context'
import { drainQueue, enqueueAll } from './queue'

export const patchGraphMindmaps = (
  context: GraphContext
): number => {
  let count = 0

  drainQueue(context.queue.mindmap).forEach((mindmapId) => {
    const result = patchMindmap({
      input: context.current,
      working: context.working,
      delta: context.working.delta.graph,
      mindmapId
    })
    if (result.changed) {
      count += 1
    }
    enqueueAll(context.queue.node, result.changedNodeIds)
  })

  return count
}
