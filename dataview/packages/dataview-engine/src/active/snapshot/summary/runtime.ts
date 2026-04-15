import type {
  CommitImpact,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  collectTouchedFieldIds,
  getViewChange,
  hasActiveViewImpact,
  hasFieldSchemaAspect
} from '@dataview/core/commit/impact'
import { viewCalcFields } from '@dataview/core/view'
import {
  collectTouchedRecordIds
} from '@dataview/engine/active/index/shared'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type {
  DeriveAction,
  SectionState,
  SummaryState
} from '@dataview/engine/contracts/internal'
import type { SectionKey } from '@dataview/engine/contracts/public'
import { runSnapshotStage } from '@dataview/engine/active/snapshot/stage'
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

const hasIntersection = (
  left: ReadonlySet<FieldId>,
  right: ReadonlySet<FieldId>
) => {
  for (const value of left) {
    if (right.has(value)) {
      return true
    }
  }

  return false
}

const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: CommitImpact
  view: View
  previous?: SummaryState
  previousSections?: SectionState
  sectionsAction: DeriveAction
}): DeriveAction => {
  if (
    !input.previous
    || !input.previousSections
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(input.impact)
  ) {
    return 'rebuild'
  }

  if (input.sectionsAction === 'rebuild') {
    return 'rebuild'
  }

  const calcFields = viewCalcFields(input.view)
  const groupField = input.view.group?.field
  const viewChange = getViewChange(input.impact, input.activeViewId)

  if (viewChange?.calculationFields) {
    return 'rebuild'
  }

  for (const fieldId of calcFields) {
    if (hasFieldSchemaAspect(input.impact, fieldId)) {
      return 'rebuild'
    }
  }
  if (groupField && hasFieldSchemaAspect(input.impact, groupField)) {
    return 'rebuild'
  }

  if (input.sectionsAction === 'sync') {
    return 'sync'
  }

  const touchedFields = collectTouchedFieldIds(input.impact, {
    includeTitlePatch: true
  })
  if (touchedFields === 'all') {
    return calcFields.size > 0
      ? 'sync'
      : 'reuse'
  }

  if (touchedFields.size > 0 && hasIntersection(calcFields, touchedFields)) {
    return 'sync'
  }

  return 'reuse'
}

export const runSummaryStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: CommitImpact
  view: View
  previous?: SummaryState
  previousSections?: SectionState
  previousPublished?: ReadonlyMap<SectionKey, import('@dataview/core/calculation').CalculationCollection>
  sections: SectionState
  sectionsAction: DeriveAction
  index: IndexState
  fieldsById: ReadonlyMap<FieldId, import('@dataview/core/contracts').Field>
}): {
  action: DeriveAction
  state: SummaryState
  summaries: ReadonlyMap<SectionKey, import('@dataview/core/calculation').CalculationCollection>
  deriveMs: number
  publishMs: number
} => {
  const touchedRecords = collectTouchedRecordIds(input.impact)
  const touchedFields = collectTouchedFieldIds(input.impact, {
    includeTitlePatch: true
  })
  const action = resolveSummaryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    previous: input.previous,
    previousSections: input.previousSections,
    sectionsAction: input.sectionsAction
  })
  const stage = runSnapshotStage({
    action,
    previousState: input.previous,
    previousPublished: input.previousPublished,
    derive: () => syncSummaryState({
      previous: input.previous,
      previousSections: input.previousSections,
      sections: input.sections,
      view: input.view,
      index: input.index,
      action,
      touchedRecords,
      touchedFields
    }),
    publish: state => publishSummaries({
      summary: state,
      previousSummary: input.previous,
      previous: input.previousPublished,
      fieldsById: input.fieldsById,
      view: input.view
    })
  })

  return {
    action: stage.action,
    state: stage.state,
    summaries: stage.published,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs
  }
}
