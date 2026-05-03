import type {
  RecordId
} from '@dataview/core/types'
import {
  projectListChange
} from '@shared/delta'
import type {
  DataviewActiveSpec,
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewIndexResult
} from '@dataview/engine/active/index/runtime'
import type {
  DataviewActivePlan
} from '@dataview/engine/active/plan'
import {
  buildQueryState
} from '@dataview/engine/active/query/state'
import {
  readSelectionIdSet
} from '@dataview/engine/active/shared/selection'
import type {
  DataviewActiveState,
  DataviewStageTrace,
  QueryPhaseDelta,
  QueryPhaseState
} from '@dataview/engine/active/state'
import {
  EMPTY_QUERY_PHASE_DELTA
} from '@dataview/engine/active/state'
import { now } from '@dataview/engine/runtime/clock'
import {
  createActiveStageMetrics
} from '@dataview/engine/active/projection/metrics'

const EMPTY_RECORD_IDS = [] as readonly RecordId[]

export const runQueryStep = (input: {
  frame: DataviewFrame
  active: DataviewActiveSpec
  index: DataviewIndexResult
  plan: DataviewActivePlan
  previous: DataviewActiveState
}): {
  state: QueryPhaseState
  delta: QueryPhaseDelta
  trace: DataviewStageTrace
} => {
  const action = input.plan.query.action
  const previous = input.previous.query
  const reuse = input.plan.query.reuse
  const deriveStart = now()
  const state = action === 'reuse'
    ? previous
      : buildQueryState({
        reader: input.frame.query,
        view: input.active.view,
        index: input.index.index.state,
        plan: input.active.query,
        previous,
        reuse: reuse
          ? {
              ...(reuse.matched
                ? {
                    matched: previous.matched.read.ids()
                  }
                : {}),
              ...(reuse.ordered
                ? {
                    ordered: previous.ordered.read.ids()
                  }
                : {})
            }
          : undefined
      })
  const deriveMs = now() - deriveStart
  const matched = state.matched.read.ids()
  const ordered = state.ordered.read.ids()
  const visible = state.visible.read.ids()

  let changedRecordCount = 0
  let delta: QueryPhaseDelta = EMPTY_QUERY_PHASE_DELTA

  if (action === 'rebuild') {
    delta = {
      rebuild: true,
      added: visible,
      removed: EMPTY_RECORD_IDS,
      orderChanged: false
    }
    changedRecordCount = visible.length
  } else if (action === 'sync') {
    const previousVisible = previous.visible.read.ids()
    const nextVisible = visible
    const previousOrdered = previous.ordered.read.ids()
    const nextOrdered = ordered
    const diff = projectListChange({
      previous: previousVisible,
      next: nextVisible,
      previousSet: previousVisible.length <= nextVisible.length
        ? readSelectionIdSet(previous.visible)
        : undefined,
      nextSet: nextVisible.length < previousVisible.length
        ? readSelectionIdSet(state.visible)
        : undefined
    })

    if (diff.changed || previousOrdered !== nextOrdered) {
      changedRecordCount = diff.added.length + diff.removed.length
    }

    delta = {
      rebuild: false,
      added: diff.added,
      removed: diff.removed,
      orderChanged: previousOrdered !== nextOrdered
    }
  }

  const changed = action !== 'reuse' && (
    delta.rebuild
    || delta.added.length > 0
    || delta.removed.length > 0
    || delta.orderChanged
  )
  const reusedNodeCount = (
    (previous.matched.read.ids() === matched ? 1 : 0)
    + (previous.ordered.read.ids() === ordered ? 1 : 0)
    + (previous.visible.read.ids() === visible ? 1 : 0)
  )

  return {
    state,
    delta,
    trace: {
      action,
      changed,
      deriveMs,
      publishMs: 0,
      metrics: createActiveStageMetrics({
        inputCount: previous.visible.read.count(),
        outputCount: state.visible.read.count(),
        reusedNodeCount,
        rebuiltNodeCount: 3 - reusedNodeCount,
        changedRecordCount
      })
    }
  }
}
