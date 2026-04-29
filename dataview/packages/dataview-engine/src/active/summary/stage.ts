import type {
  FieldId,
  View,
  ViewId
} from '@dataview/core/types'
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
import type {
  DataviewMutationDelta
} from '@dataview/engine/mutation/delta'
import {
  createActiveStageMetrics
} from '../projection/metrics'

const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  delta: DataviewMutationDelta
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
    || input.delta.document.activeViewChanged()
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
  if (input.delta.view.calc(input.activeViewId).changed()) {
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

    if (input.delta.field.schema.changed(fieldId)) {
      return {
        action: 'rebuild'
      }
    }
  }

  if (groupField && input.delta.field.schema.changed(groupField)) {
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
  delta: DataviewMutationDelta
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
    delta: input.delta,
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
