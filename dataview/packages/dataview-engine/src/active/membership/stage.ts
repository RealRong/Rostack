import {
  dataviewTrace
} from '@dataview/core/mutation'
import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  syncMembershipState
} from '@dataview/engine/active/membership/derive'
import {
  hasMembershipChanges
} from '@dataview/engine/active/shared/transition'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA,
  EMPTY_QUERY_PHASE_DELTA
} from '@dataview/engine/active/state'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction,
  QueryPhaseDelta,
  QueryPhaseState
} from '@dataview/engine/active/state'
import type {
  SectionId
} from '@dataview/engine/contracts/shared'
import { now } from '@dataview/engine/runtime/clock'
import {
  type BaseImpact,
  hasField,
  hasQueryDeltaChanges
} from '../projection/impact'
import {
  type ActiveProjectionPhase,
  readActiveView
} from '../projection/context'
import {
  createActiveStageMetrics,
  toActivePhaseMetrics
} from '../projection/metrics'
import {
  membershipPhaseScope
} from '../contracts/projection'

const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

const resolveMembershipAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  view: View
  previous?: MembershipPhaseState
  queryDelta: QueryPhaseDelta
  indexDelta?: IndexDelta
}): PhaseAction => {
  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || dataviewTrace.has.activeView(input.impact.trace)
  ) {
    return 'rebuild'
  }

  if (input.queryDelta.rebuild || input.indexDelta?.bucket?.rebuild) {
    return 'rebuild'
  }

  const groupField = input.view.group?.fieldId
  if (!groupField) {
    return hasQueryDeltaChanges(input.queryDelta)
      ? 'sync'
      : 'reuse'
  }

  if (
    dataviewTrace.has.viewQuery(input.impact.trace, input.activeViewId, ['group'])
    || dataviewTrace.has.fieldSchema(input.impact.trace, groupField)
    || dataviewTrace.has.recordSetChange(input.impact.trace)
  ) {
    return 'rebuild'
  }

  const touchedFields = input.impact.touchedFields
  if (hasField(touchedFields, groupField)) {
    return 'sync'
  }

  return hasQueryDeltaChanges(input.queryDelta) || hasMembershipChanges(input.indexDelta?.bucket)
    ? 'sync'
    : 'reuse'
}

const buildMembershipDelta = (input: {
  previous?: MembershipPhaseState
  next: MembershipPhaseState
  records: MembershipPhaseDelta['records']
  action: PhaseAction
}): MembershipPhaseDelta => {
  const nextKeys = input.next.sections.order.filter(sectionId => input.next.sections.get(sectionId))
  const previousKeys = input.previous?.sections.order ?? []
  const removed = previousKeys.filter(sectionId => !input.next.sections.get(sectionId))
  const rebuild = input.action === 'rebuild'
  const orderChanged = !equal.sameOrder(previousKeys, input.next.sections.order)

  if (rebuild) {
    return {
      rebuild: true,
      orderChanged,
      removed,
      changed: nextKeys,
      records: input.records
    }
  }

  const changed = new Set<SectionId>()
  input.records.forEach(({ before, after }) => {
    before.forEach(sectionId => {
      changed.add(sectionId)
    })
    after.forEach(sectionId => {
      changed.add(sectionId)
    })
  })
  nextKeys.forEach(sectionId => {
    const previousSelection = input.previous?.sections.get(sectionId)
    const nextSelection = input.next.sections.get(sectionId)
    if (
      nextSelection
      && (
        previousSelection !== nextSelection
        || input.previous?.meta.get(sectionId) !== input.next.meta.get(sectionId)
      )
    ) {
      changed.add(sectionId)
    }
  })

  return {
    rebuild: false,
    orderChanged,
    removed,
    changed: [...changed],
    records: input.records
  }
}

const deriveMembershipState = (input: {
  action: PhaseAction
  view: View
  query: QueryPhaseState
  queryDelta: QueryPhaseDelta
  previous?: MembershipPhaseState
  impact: BaseImpact
  index: IndexState
  indexDelta?: IndexDelta
}) => {
  if (input.action === 'reuse' && input.previous) {
    return {
      state: input.previous,
      delta: EMPTY_MEMBERSHIP_PHASE_DELTA
    }
  }

  const synced = syncMembershipState({
    previous: input.previous,
    view: input.view,
    query: input.query,
    queryDelta: input.queryDelta,
    index: input.index,
    impact: input.impact,
    indexDelta: input.indexDelta,
    action: input.action
  })
  const delta = buildMembershipDelta({
    previous: input.previous,
    next: synced.state,
    records: synced.records,
    action: input.action
  })

  return {
    state: synced.state,
    delta
  }
}

export const runMembershipStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  view: View
  query: QueryPhaseState
  queryDelta: QueryPhaseDelta
  previous?: MembershipPhaseState
  index: IndexState
  indexDelta?: IndexDelta
}) => {
  const action = resolveMembershipAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    previous: input.previous,
    queryDelta: input.queryDelta,
    indexDelta: input.indexDelta
  })
  const deriveStart = now()
  const derived = deriveMembershipState({
    action,
    view: input.view,
    query: input.query,
    queryDelta: input.queryDelta,
    previous: input.previous,
    impact: input.impact,
    index: input.index,
    indexDelta: input.indexDelta
  })
  const deriveMs = now() - deriveStart
  const outputCount = derived.state.sections.order.length
  const changedSectionCount = action === 'reuse'
    ? 0
    : derived.delta.rebuild
      ? outputCount
      : Math.min(outputCount, derived.delta.changed.length + derived.delta.removed.length)

  return {
    action,
    state: derived.state,
    delta: derived.delta,
    deriveMs,
    publishMs: 0,
    metrics: createActiveStageMetrics({
      inputCount: input.previous?.sections.order.length,
      outputCount,
      changedNodeCount: changedSectionCount,
      changedSectionCount
    })
  }
}

export const activeMembershipPhase: ActiveProjectionPhase<'membership'> = {
  after: ['query'],
  scope: membershipPhaseScope,
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    if (!activeViewId || !view) {
      return {
        action: 'reuse',
        metrics: EMPTY_METRICS
      }
    }

    const previousState = context.state.membership.state
    const queryScope = context.scope?.query
    const result = runMembershipStage({
      activeViewId,
      previousViewId: context.state.publish.previous?.view.id,
      impact: context.input.impact,
      view,
      query: context.state.query.state,
      queryDelta: queryScope?.delta ?? EMPTY_QUERY_PHASE_DELTA,
      previous: previousState,
      index: context.input.index.state,
      indexDelta: context.input.index.delta
    })

    context.state.membership.state = result.state

    return {
      action: result.action,
      metrics: toActivePhaseMetrics({
        deriveMs: result.deriveMs,
        publishMs: result.publishMs,
        stage: result.metrics
      }),
      ...(result.action !== 'reuse'
        ? {
            emit: {
              summary: {
                membership: {
                  action: result.action,
                  previous: previousState,
                  delta: result.delta
                }
              },
              publish: {
                membership: {
                  previous: previousState
                }
              }
            }
          }
        : {})
    }
  }
}
