import { patchMindmap } from './mindmap'
import type { GraphContext } from './context'
import { appendIds } from '../scope'
import { drainQueue } from './queue'

export const patchGraphMindmaps = (
  context: GraphContext
): number => {
  let count = 0

  drainQueue(context.queue.mindmap).forEach((mindmapId) => {
    const result = patchMindmap({
      input: context.current,
      working: context.working,
      delta: context.working.phase.graph,
      mindmapId
    })
    if (result.changed) {
      count += 1
    }
    appendIds(context.queue.node, result.changedNodeIds)
  })

  return count
}
