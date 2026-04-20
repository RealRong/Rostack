import { err, ok } from '@whiteboard/core/result'
import { getSubtreeIds } from '@whiteboard/core/mindmap'
import {
  getMindmap,
  getMindmapTreeFromDraft,
  relayoutMindmap
} from '@whiteboard/core/kernel/reduce/draft'
import { markChange } from '@whiteboard/core/kernel/reduce/state'
import type { ReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'
import type { Result, ResultCode } from '@whiteboard/core/types'

type ReconcileTask = {
  type: 'mindmap.layout'
  id: string
}

const MAX_RECONCILE_STEPS = 100
const MAX_RECONCILE_REPEAT = 10

export type ReconcileQueue = {
  enqueue: (task: ReconcileTask) => void
  drain: (run: (task: ReconcileTask) => void) => Result<void, ResultCode>
}

export const createReconcileQueue = (): ReconcileQueue => {
  const tasks: ReconcileTask[] = []
  const queued = new Set<string>()

  return {
    enqueue: (task: ReconcileTask) => {
      const key = `${task.type}:${task.id}`
      if (queued.has(key)) {
        return
      }
      queued.add(key)
      tasks.push(task)
    },
    drain: (
      run: (task: ReconcileTask) => void
    ) => {
      const repeats = new Map<string, number>()
      let steps = 0

      while (tasks.length > 0) {
        if (steps >= MAX_RECONCILE_STEPS) {
          return err(
            'internal',
            'Reconcile budget exceeded.',
            {
              reason: 'reconcile_budget_exceeded'
            }
          )
        }

        const task = tasks.shift()!
        const key = `${task.type}:${task.id}`
        queued.delete(key)

        const count = (repeats.get(key) ?? 0) + 1
        repeats.set(key, count)
        if (count > MAX_RECONCILE_REPEAT) {
          return err(
            'internal',
            'Reconcile cycle detected.',
            {
              reason: 'reconcile_cycle'
            }
          )
        }

        run(task)
        steps += 1
      }

      return ok(undefined)
    }
  }
}

export const drainReduceReconcile = (
  runtime: ReduceRuntime
) => runtime.reconcile.drain((task) => {
  if (task.type !== 'mindmap.layout') {
    return
  }

  relayoutMindmap(runtime.draft, task.id)
  const record = getMindmap(runtime.draft, task.id)
  if (!record) {
    return
  }

  getSubtreeIds(getMindmapTreeFromDraft(runtime.draft, task.id)!, record.root).forEach((nodeId) => {
    markChange(runtime.changes.nodes, 'update', nodeId)
  })
})
