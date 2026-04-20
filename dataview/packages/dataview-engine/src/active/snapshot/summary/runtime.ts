import type {
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  Field,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ViewStageMetrics
} from '@dataview/engine/contracts/public'
import {
  getViewChange,
  hasActiveViewImpact,
  hasFieldSchemaAspect
} from '@dataview/core/commit/impact'
import {
  sameOrder
} from '@shared/core'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type {
  DeriveAction,
  QueryState,
  SectionState,
  SummaryState
} from '@dataview/engine/contracts/internal'
import type { SectionKey } from '@dataview/engine/contracts/public'
import { runSnapshotStage } from '@dataview/engine/active/snapshot/stage'
import {
  hasCalculationChanges,
  hasMembershipChanges
} from '@dataview/engine/active/shared/impact'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import { publishSummaries } from '@dataview/engine/active/snapshot/summary/publish'
import {
  syncSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'

export {
  computeCalculationFromState
} from '@dataview/engine/active/snapshot/summary/compute'
export {
  syncSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'

const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: ActiveImpact
  view: View
  calcFields: ReadonlySet<FieldId>
  previous?: SummaryState
  previousSections?: SectionState
  sections: SectionState
  sectionsAction: DeriveAction
}): DeriveAction => {
  const commit = input.impact.commit

  if (
    !input.previous
    || !input.previousSections
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(commit)
  ) {
    return 'rebuild'
  }

  if (!input.calcFields.size) {
    return sameOrder(input.previousSections.order, input.sections.order)
      ? 'reuse'
      : 'sync'
  }

  if (input.sectionsAction === 'rebuild' || input.impact.sections?.rebuild) {
    return 'rebuild'
  }

  const groupField = input.view.group?.field
  const viewChange = getViewChange(commit, input.activeViewId)

  if (viewChange?.calculationFields) {
    return 'rebuild'
  }

  for (const fieldId of input.calcFields) {
    if (hasFieldSchemaAspect(commit, fieldId)) {
      return 'rebuild'
    }
  }
  if (groupField && hasFieldSchemaAspect(commit, groupField)) {
    return 'rebuild'
  }

  if (
    !sameOrder(input.previousSections.order, input.sections.order)
    || hasMembershipChanges(input.impact.sections)
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
  query: QueryState
  calcFields: readonly FieldId[]
  previous?: SummaryState
  previousSections?: SectionState
  previousPublished?: ReadonlyMap<SectionKey, CalculationCollection>
  sections: SectionState
  sectionsAction: DeriveAction
  index: IndexState
  fieldsById: ReadonlyMap<FieldId, Field>
}): {
  action: DeriveAction
  state: SummaryState
  summaries: ReadonlyMap<SectionKey, CalculationCollection>
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
  const action = resolveSummaryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    calcFields: new Set(input.calcFields),
    previous: input.previous,
    previousSections: input.previousSections,
    sections: input.sections,
    sectionsAction: input.sectionsAction
  })
  const stage = runSnapshotStage({
    action,
    previousState: input.previous,
    previousPublished: input.previousPublished,
    derive: () => action === 'reuse' && input.previous
      ? input.previous
      : syncSummaryState({
          previous: input.previous,
          sections: input.sections,
          view: input.view,
          index: input.index,
          impact: input.impact,
          action,
        }),
    canReusePublished: stageInput => (
      stageInput.state === input.previous
      && stageInput.previousPublished !== undefined
    ),
    publish: state => publishSummaries({
      summary: state,
      previousSummary: input.previous,
      previous: input.previousPublished,
      fieldsById: input.fieldsById,
      view: input.view
    })
  })

  const outputCount = stage.published.size
  const changedSectionCount = stage.action === 'reuse'
    ? 0
    : stage.action === 'rebuild'
      ? outputCount
      : Math.min(
          outputCount,
          input.impact.sections?.touchedKeys.size
            ?? (input.previousPublished === stage.published ? 0 : outputCount)
        )
  const reusedNodeCount = Math.max(0, outputCount - changedSectionCount)

  return {
    action: stage.action,
    state: stage.state,
    summaries: stage.published,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs,
    metrics: {
      inputCount: input.previousPublished?.size,
      outputCount,
      reusedNodeCount,
      rebuiltNodeCount: outputCount - reusedNodeCount,
      changedSectionCount
    }
  }
}
