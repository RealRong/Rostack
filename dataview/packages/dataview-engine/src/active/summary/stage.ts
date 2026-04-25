import {
  dataviewTrace
} from '@dataview/core/mutation'
import type {
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import {
  deriveSummaryState,
  resolveSummaryTouchedSections
} from '@dataview/engine/active/summary/derive'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA
} from '@dataview/engine/active/state'
import { now } from '@dataview/engine/runtime/clock'
import {
  type BaseImpact
} from '../projector/impact'
import {
  defineActiveProjectorPhase,
  readActiveView
} from '../projector/context'
import {
  createActiveStageMetrics,
  toActivePhaseMetrics
} from '../projector/metrics'
import { createPublishPhaseScope } from '../projector/scope'

const EMPTY_METRICS = toActivePhaseMetrics({
  deriveMs: 0,
  publishMs: 0
})

const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  indexDelta?: IndexDelta
  view: View
  calcFields: readonly FieldId[]
  previous?: SummaryPhaseState
  previousMembership?: MembershipPhaseState
  membership: MembershipPhaseState
  membershipAction: PhaseAction
  membershipDelta: MembershipPhaseDelta
}): {
  action: PhaseAction
  touchedSections?: ReadonlySet<string> | 'all'
} => {
  if (
    !input.previous
    || !input.previousMembership
    || input.previousViewId !== input.activeViewId
    || dataviewTrace.has.activeView(input.impact.trace)
  ) {
    return {
      action: 'rebuild'
    }
  }

  if (!input.calcFields.length) {
    return {
      action: equal.sameOrder(
        input.previousMembership.sections.order,
        input.membership.sections.order
      )
        ? 'reuse'
        : 'sync'
    }
  }

  if (input.membershipAction === 'rebuild' || input.membershipDelta.rebuild) {
    return {
      action: 'rebuild'
    }
  }

  const groupField = input.view.group?.fieldId
  const viewChange = dataviewTrace.view.change(input.impact.trace, input.activeViewId)

  if (viewChange?.calculationFields) {
    return {
      action: 'rebuild'
    }
  }

  for (const fieldId of input.calcFields) {
    if (input.indexDelta?.calculation?.fields.get(fieldId)?.rebuild) {
      return {
        action: 'rebuild'
      }
    }

    if (dataviewTrace.has.fieldSchema(input.impact.trace, fieldId)) {
      return {
        action: 'rebuild'
      }
    }
  }

  if (groupField && dataviewTrace.has.fieldSchema(input.impact.trace, groupField)) {
    return {
      action: 'rebuild'
    }
  }

  const touchedSections = resolveSummaryTouchedSections({
    previousMembership: input.previousMembership,
    membership: input.membership,
    membershipDelta: input.membershipDelta,
    calcFields: input.calcFields,
    calculationDelta: input.indexDelta?.calculation
  })

  if (
    !equal.sameOrder(input.previousMembership.sections.order, input.membership.sections.order)
    || input.membershipDelta.removed.length > 0
    || touchedSections === 'all'
    || touchedSections.size > 0
  ) {
    return {
      action: 'sync',
      touchedSections
    }
  }

  return {
    action: 'reuse',
    touchedSections
  }
}

export const runSummaryStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  indexDelta?: IndexDelta
  view: View
  calcFields: readonly FieldId[]
  previous?: SummaryPhaseState
  previousMembership?: MembershipPhaseState
  membership: MembershipPhaseState
  membershipAction: PhaseAction
  membershipDelta: MembershipPhaseDelta
  index: IndexState
}) => {
  const resolved = resolveSummaryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    indexDelta: input.indexDelta,
    view: input.view,
    calcFields: input.calcFields,
    previous: input.previous,
    previousMembership: input.previousMembership,
    membership: input.membership,
    membershipAction: input.membershipAction,
    membershipDelta: input.membershipDelta
  })
  const deriveStart = now()
  const derived = deriveSummaryState({
    previous: input.previous,
    previousMembership: input.previousMembership,
    membership: input.membership,
    membershipDelta: input.membershipDelta,
    calcFields: input.calcFields,
    index: input.index,
    calculationDelta: input.indexDelta?.calculation,
    touchedSections: resolved.touchedSections,
    action: resolved.action
  })
  const deriveMs = now() - deriveStart
  const outputCount = derived.state.bySection.size
  const changedSectionCount = resolved.action === 'reuse'
    ? 0
    : derived.delta.rebuild
      ? outputCount
      : Math.min(outputCount, derived.delta.changed.length + derived.delta.removed.length)

  return {
    action: resolved.action,
    state: derived.state,
    delta: derived.delta,
    deriveMs,
    publishMs: 0,
    metrics: createActiveStageMetrics({
      inputCount: input.previous?.bySection.size,
      outputCount,
      changedNodeCount: changedSectionCount,
      changedSectionCount
    })
  }
}

export const activeSummaryPhase = defineActiveProjectorPhase({
  name: 'summary',
  deps: ['membership'],
  run: (context) => {
    const { activeViewId, view } = readActiveView(context.input)
    const plan = context.input.view.plan
    if (!activeViewId || !view || !plan) {
      return {
        action: 'reuse',
        metrics: EMPTY_METRICS
      }
    }

    const previousState = context.working.summary.state
    const membershipScope = context.scope?.membership
    const result = runSummaryStage({
      activeViewId,
      previousViewId: context.previous?.view.id,
      impact: context.input.impact,
      indexDelta: context.input.index.delta,
      view,
      calcFields: plan.calcFields,
      previous: previousState,
      previousMembership: membershipScope?.previous ?? context.working.membership.state,
      membership: context.working.membership.state,
      membershipAction: membershipScope?.action ?? 'reuse',
      membershipDelta: membershipScope?.delta ?? EMPTY_MEMBERSHIP_PHASE_DELTA,
      index: context.input.index.state
    })

    context.working.summary.state = result.state

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
              publish: createPublishPhaseScope({
                summary: {
                  previous: previousState,
                  delta: result.delta
                }
              })
            }
          }
        : {})
    }
  }
})
