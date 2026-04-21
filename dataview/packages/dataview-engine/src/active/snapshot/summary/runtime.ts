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
} from '@dataview/engine/contracts'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { equal } from '@shared/core'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type {
  DeriveAction,
  SectionState,
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/state'
import type { SectionKey } from '@dataview/engine/contracts'
import {
  hasCalculationChanges,
  hasMembershipChanges
} from '@dataview/engine/active/shared/impact'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import { publishSummaries } from '@dataview/engine/active/snapshot/summary/publish'
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
}): DeriveAction => {
  const commit = input.impact.commit
  const visibleChanged = Boolean(
    input.impact.query?.visibleAdded.length
    || input.impact.query?.visibleRemoved.length
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

  if (input.sectionsAction === 'rebuild' || input.impact.section?.rebuild) {
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
    || visibleChanged
    || hasMembershipChanges(input.impact.bucket)
    || hasMembershipChanges(input.impact.section)
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
  previousPublished?: ReadonlyMap<SectionKey, CalculationCollection>
  sections: SectionState
  sectionsAction: DeriveAction
  index: IndexState
  fieldsById: ReadonlyMap<FieldId, Field>
}): {
  action: DeriveAction
  state: SummaryState
  delta: SummaryDelta
  summaries: ReadonlyMap<SectionKey, CalculationCollection>
  deriveMs: number
  publishMs: number
  metrics: ViewStageMetrics
} => {
  const visibleChanged = Boolean(
    input.impact.query?.visibleAdded.length
    || input.impact.query?.visibleRemoved.length
  )
  const bucketChanged = hasMembershipChanges(input.impact.bucket)
  const sectionChanged = hasMembershipChanges(input.impact.section)
  const calculationChanged = hasCalculationChanges(input.impact, input.calcFields)
  const orderChanged = !equal.sameOrder(
    input.previousSections?.order ?? [],
    input.sections.order
  )
  const action = resolveSummaryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    impact: input.impact,
    view: input.view,
    calcFields: input.calcFields,
    previous: input.previous,
    previousSections: input.previousSections,
    sections: input.sections,
    sectionsAction: input.sectionsAction
  })
  const deriveStart = now()
  const derived = deriveSummaryState({
    previous: input.previous,
    previousSections: input.previousSections,
    sections: input.sections,
    calcFields: input.calcFields,
    index: input.index,
    impact: input.impact,
    action
  })
  const deriveMs = now() - deriveStart
  const canReusePublished = (
    derived.state === input.previous
    && input.previousPublished !== undefined
  )
  const publishStart = canReusePublished
    ? 0
    : now()
  const summaries = canReusePublished
    ? input.previousPublished!
    : publishSummaries({
        summary: derived.state,
        previousSummary: input.previous,
        previous: input.previousPublished,
        fieldsById: input.fieldsById,
        view: input.view
      })
  const publishMs = canReusePublished
    ? 0
    : now() - publishStart

  const outputCount = summaries.size
  const changedSectionCount = action === 'reuse'
    ? 0
    : derived.delta.rebuild
      ? outputCount
      : Math.min(
          outputCount,
          derived.delta.changed.length + derived.delta.removed.length
        )
  const reusedNodeCount = Math.max(0, outputCount - changedSectionCount)

  console.log('[dv-summary-debug][summary]', {
    action,
    sectionsAction: input.sectionsAction,
    canReusePublished,
    guards: {
      hasPrevious: input.previous !== undefined,
      hasPreviousSections: input.previousSections !== undefined,
      sameView: input.previousViewId === input.activeViewId,
      calcFieldCount: input.calcFields.length
    },
    reasons: {
      orderChanged,
      visibleChanged,
      bucketChanged,
      sectionChanged,
      calculationChanged,
      sectionRebuild: input.impact.section?.rebuild === true,
      activeViewChanged: commitImpact.has.activeView(input.impact.commit)
    },
    queryImpact: input.impact.query
      ? {
          rebuild: input.impact.query.rebuild === true,
          visibleAdded: input.impact.query.visibleAdded.length,
          visibleRemoved: input.impact.query.visibleRemoved.length,
          orderChanged: input.impact.query.orderChanged === true
        }
      : undefined,
    bucketImpact: input.impact.bucket
      ? {
          rebuild: input.impact.bucket.rebuild === true,
          recordCount: input.impact.bucket.records.size
        }
      : undefined,
    sectionImpact: input.impact.section
      ? {
          rebuild: input.impact.section.rebuild === true,
          recordCount: input.impact.section.records.size
        }
      : undefined,
    delta: {
      rebuild: derived.delta.rebuild,
      changed: derived.delta.changed,
      removed: derived.delta.removed
    }
  })

  return {
    action,
    state: derived.state,
    delta: derived.delta,
    summaries,
    deriveMs,
    publishMs,
    metrics: {
      inputCount: input.previousPublished?.size,
      outputCount,
      reusedNodeCount,
      rebuiltNodeCount: outputCount - reusedNodeCount,
      changedSectionCount
    }
  }
}
