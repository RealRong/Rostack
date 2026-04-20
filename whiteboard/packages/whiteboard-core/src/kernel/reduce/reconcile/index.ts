import { err, ok } from '@whiteboard/core/result'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { enqueueMindmapLayout, runMindmapLayout } from '@whiteboard/core/kernel/reduce/reconcile/mindmap'

const MAX_RECONCILE_STEPS = 100
const MAX_RECONCILE_REPEAT = 10

export const createReconcileApi = (
  tx: ReducerTx
) => ({
  mindmap: {
    layout: (id: import('@whiteboard/core/types').MindmapId) => enqueueMindmapLayout(tx, id)
  },
  run: () => {
    const repeats = new Map<string, number>()
    let steps = 0

    while (tx._runtime.reconcile.tasks.length > 0) {
      if (steps >= MAX_RECONCILE_STEPS) {
        return err('internal', 'Reconcile budget exceeded.', {
          reason: 'reconcile_budget_exceeded'
        })
      }

      const task = tx._runtime.reconcile.tasks.shift()!
      const key = `${task.type}:${task.id}`
      tx._runtime.reconcile.queued.delete(key)

      const count = (repeats.get(key) ?? 0) + 1
      repeats.set(key, count)
      if (count > MAX_RECONCILE_REPEAT) {
        return err('internal', 'Reconcile cycle detected.', {
          reason: 'reconcile_cycle'
        })
      }

      if (task.type === 'mindmap.layout') {
        runMindmapLayout(tx, task.id)
      }

      steps += 1
    }

    return ok(undefined)
  }
})
