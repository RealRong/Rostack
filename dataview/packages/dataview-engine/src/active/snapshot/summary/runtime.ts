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
  hasCalculationChanges
} from '@dataview/engine/active/shared/transition'
import {
  deriveSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'
import type {
  DeriveAction,
  MembershipDelta,
  MembershipState,
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/state'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts'
import { now } from '@dataview/engine/runtime/clock'

const sameRecordSet = (
  left: readonly string[],
  right: readonly string[]
) => {
  if (left === right || equal.sameOrder(left, right)) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left)
  for (let index = 0; index < right.length; index += 1) {
    if (!leftSet.has(right[index]!)) {
      return false
    }
  }

  return true
}

export {
  deriveSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'

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
}): DeriveAction => {
  const commit = input.impact.commit
  const membershipChanged = (() => {
    if (
      input.membershipDelta.rebuild
      || input.membershipDelta.orderChanged
      || input.membershipDelta.removed.length > 0
      || input.membershipDelta.records.size > 0
    ) {
      return true
    }

    for (let index = 0; index < input.membershipDelta.changed.length; index += 1) {
      const sectionKey = input.membershipDelta.changed[index]!
      const previousSelection = input.previousMembership?.sections.get(sectionKey)
      const nextSelection = input.membership.sections.get(sectionKey)
      if (!previousSelection || !nextSelection) {
        return true
      }

      if (!sameRecordSet(previousSelection.read.ids(), nextSelection.read.ids())) {
        return true
      }
    }

    return false
  })()

  if (
    !input.previous
    || !input.previousMembership
    || input.previousViewId !== input.activeViewId
    || commitImpact.has.activeView(commit)
  ) {
    return 'rebuild'
  }

  if (!input.calcFields.length) {
    return equal.sameOrder(input.previousMembership.sections.order, input.membership.sections.order)
      ? 'reuse'
      : 'sync'
  }

  if (input.membershipAction === 'rebuild' || input.membershipDelta.rebuild) {
    return 'rebuild'
  }

  const groupField = input.view.group?.field
  const viewChange = commitImpact.view.change(commit, input.activeViewId)

  if (viewChange?.calculationFields) {
    return 'rebuild'
  }

  for (const fieldId of input.calcFields) {
    if (input.indexDelta?.calculation?.fields.get(fieldId)?.rebuild) {
      return 'rebuild'
    }

    if (commitImpact.has.fieldSchema(commit, fieldId)) {
      return 'rebuild'
    }
  }
  if (groupField && commitImpact.has.fieldSchema(commit, groupField)) {
    return 'rebuild'
  }

  if (
    !equal.sameOrder(input.previousMembership.sections.order, input.membership.sections.order)
    || membershipChanged
  ) {
    return 'sync'
  }

  if (hasCalculationChanges(input.indexDelta?.calculation, input.calcFields)) {
    return 'sync'
  }

  return 'reuse'
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
  const action = resolveSummaryAction({
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
    action
  })
  const deriveMs = now() - deriveStart
  const outputCount = derived.state.bySection.size
  const changedSectionCount = action === 'reuse'
    ? 0
    : derived.delta.rebuild
      ? outputCount
      : Math.min(
          outputCount,
          derived.delta.changed.length + derived.delta.removed.length
        )
  const reusedNodeCount = Math.max(0, outputCount - changedSectionCount)

  return {
    action,
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
