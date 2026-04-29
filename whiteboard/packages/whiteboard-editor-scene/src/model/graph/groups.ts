import { patchGroup } from './group'
import type { GraphContext } from './context'
import { drainQueue } from './queue'

export const patchGraphGroups = (
  context: GraphContext
): number => {
  let count = 0

  drainQueue(context.queue.group).forEach((groupId) => {
    if (patchGroup({
      input: context.current,
      working: context.working,
      delta: context.working.phase.graph,
      groupId
    }).changed) {
      count += 1
    }
  })

  return count
}
