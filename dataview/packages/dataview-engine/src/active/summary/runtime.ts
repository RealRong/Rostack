import { impact as commitImpact } from '@dataview/core/commit/impact'
import { equal } from '@shared/core'
import type {
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  IndexDelta,
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import {
  deriveSummaryState,
  resolveSummaryTouchedSections
} from '@dataview/engine/active/summary/derive'
import type {
  MembershipPhaseDelta as MembershipDelta,
  MembershipPhaseState as MembershipState,
  PhaseAction as DeriveAction,
  SummaryPhaseDelta as SummaryDelta,
  SummaryPhaseState as SummaryState
} from '@dataview/engine/active/state'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts/performance'
import type {
  SectionId
} from '@dataview/engine/contracts/shared'
import { now } from '@dataview/engine/runtime/clock'

export {
  deriveSummaryState
} from '@dataview/engine/active/summary/derive'

const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  indexDelta?: IndexDelta
  view: View
  calcFields: readonly FieldId[]
  previous?: SummaryState
  previousMembership?: MembershipState
  membership: MembershipState
  membershipAction: DeriveAction
  membershipDelta: MembershipDelta
}): {
  action: DeriveAction
  touchedSections?: ReadonlySet<SectionId> | 'all'
} => {
  const commit = input.impact.commit

  if (
    !input.previous
    || !input.previousMembership
    || input.previousViewId !== input.activeViewId
    || commitImpact.has.activeView(commit)
  ) {
    return {
      action: 'rebuild'
    }
  }

  if (!input.calcFields.length) {
    return {
      action: equal.sameOrder(input.previousMembership.sections.order, input.membership.sections.order)
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
  const viewChange = commitImpact.view.change(commit, input.activeViewId)

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

    if (commitImpact.has.fieldSchema(commit, fieldId)) {
      return {
        action: 'rebuild'
      }
    }
  }
  if (groupField && commitImpact.has.fieldSchema(commit, groupField)) {
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
  previous?: SummaryState
  previousMembership?: MembershipState
  membership: MembershipState
  membershipAction: DeriveAction
  membershipDelta: MembershipDelta
  index: IndexState
}): {
  action: DeriveAction
  state: SummaryState
  delta: SummaryDelta
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
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
      : Math.min(
          outputCount,
          derived.delta.changed.length + derived.delta.removed.length
        )
  const reusedNodeCount = Math.max(0, outputCount - changedSectionCount)

  return {
    action: resolved.action,
    state: derived.state,
    delta: derived.delta,
    deriveMs,
    publishMs: 0,
    metrics: {
      inputCount: input.previous?.bySection.size,
      outputCount,
      reusedNodeCount,
      rebuiltNodeCount: outputCount - reusedNodeCount,
      changedSectionCount
    }
  }
}
