import type {
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getViewChange,
  hasActiveViewImpact,
  hasFieldSchemaAspect
} from '@dataview/core/commit/impact'
import {
  sameOrder
} from '@shared/core'
import { viewCalcFields } from '@dataview/core/view'
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
import {
  readSectionGroupIndex
} from '@dataview/engine/active/index/group/demand'
import {
  createSectionMembershipResolver
} from '@dataview/engine/active/shared/sections'
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
  previous?: SummaryState
  previousSections?: SectionState
  sections: SectionState
  sectionsAction: DeriveAction
}): DeriveAction => {
  const commit = input.impact.commit
  const calcFields = viewCalcFields(input.view)

  if (
    !input.previous
    || !input.previousSections
    || input.previousViewId !== input.activeViewId
    || hasActiveViewImpact(commit)
  ) {
    return 'rebuild'
  }

  if (!calcFields.size) {
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

  for (const fieldId of calcFields) {
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

  if (hasCalculationChanges(input.impact, calcFields)) {
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
  const action = resolveSummaryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
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
          resolver: createSectionMembershipResolver({
            query: input.query,
            view: input.view,
            sectionGroup: input.view.group
              ? readSectionGroupIndex(input.index.group, input.view.group)
              : undefined
          }),
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

  return {
    action: stage.action,
    state: stage.state,
    summaries: stage.published,
    deriveMs: stage.deriveMs,
    publishMs: stage.publishMs
  }
}
