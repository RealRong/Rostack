import type {
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { equal } from '@shared/core'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type {
  DeriveAction,
  SectionDelta,
  SectionState,
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/state'
import {
  hasCalculationChanges
} from '@dataview/engine/active/shared/impact'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import {
  deriveSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'
import { now } from '@dataview/engine/runtime/clock'

export {
  deriveSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'

const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  calcFields: readonly FieldId[]
  previous?: SummaryState
  previousSections?: SectionState
  sections: SectionState
  sectionsAction: DeriveAction
  sectionDelta: SectionDelta
}): DeriveAction => {
  const commit = input.impact.commit
  const sectionChanged = (
    input.sectionDelta.rebuild
    || input.sectionDelta.orderChanged
    || input.sectionDelta.removed.length > 0
    || input.sectionDelta.records.size > 0
  )

  if (
    !input.previous
    || !input.previousSections
    || input.previousViewId !== input.activeViewId
    || commitImpact.has.activeView(commit)
  ) {
    return 'rebuild'
  }

  if (!input.calcFields.length) {
    return equal.sameOrder(input.previousSections.order, input.sections.order)
      ? 'reuse'
      : 'sync'
  }

  if (input.sectionsAction === 'rebuild' || input.sectionDelta.rebuild) {
    return 'rebuild'
  }

  const groupField = input.view.group?.field
  const viewChange = commitImpact.view.change(commit, input.activeViewId)

  if (viewChange?.calculationFields) {
    return 'rebuild'
  }

  for (const fieldId of input.calcFields) {
    if (input.impact.calculation?.fields.get(fieldId)?.rebuild) {
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
    !equal.sameOrder(input.previousSections.order, input.sections.order)
    || sectionChanged
  ) {
    return 'sync'
  }

  if (hasCalculationChanges(input.impact, input.calcFields)) {
    return 'sync'
  }

  return 'reuse'
}

export const runSummaryStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  calcFields: readonly FieldId[]
  previous?: SummaryState
  previousSections?: SectionState
  sections: SectionState
  sectionsAction: DeriveAction
  sectionDelta: SectionDelta
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
    view: input.view,
    calcFields: input.calcFields,
    previous: input.previous,
    previousSections: input.previousSections,
    sections: input.sections,
    sectionsAction: input.sectionsAction,
    sectionDelta: input.sectionDelta
  })
  const deriveStart = now()
  const derived = deriveSummaryState({
    previous: input.previous,
    previousSections: input.previousSections,
    sections: input.sections,
    sectionDelta: input.sectionDelta,
    calcFields: input.calcFields,
    index: input.index,
    impact: input.impact,
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
