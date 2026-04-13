import type {
  CommitDelta,
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { TITLE_FIELD_ID } from '@dataview/core/contracts'
import { viewCalcFields } from '@dataview/core/view'
import {
  now
} from '../../../runtime/clock'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from '../../index/shared'
import type { IndexState } from '../../index/contracts'
import type {
  DeriveAction,
  SectionState,
  SummaryState
} from '../../../contracts/internal'
import type { SectionKey } from '../../../contracts/public'
import { publishSummaries } from './publish'
import {
  syncSummaryState
} from './sync'

export {
  computeCalculationFromState
} from './compute'
export {
  syncSummaryState
} from './sync'

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

const collectTouchedFields = (
  delta: CommitDelta
): ReadonlySet<FieldId> | 'all' => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
  ) {
    return 'all'
  }

  return new Set([
    ...collectSchemaFieldIds(delta),
    ...collectValueFieldIds(delta, { includeTitlePatch: true })
  ])
}

const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  delta: CommitDelta
  view: View
  previous?: SummaryState
  previousSections?: SectionState
  sectionsAction: DeriveAction
}): DeriveAction => {
  if (
    !input.previous
    || !input.previousSections
    || input.previousViewId !== input.activeViewId
    || input.delta.semantics.some(item => item.kind === 'activeView.set')
  ) {
    return 'rebuild'
  }

  if (input.sectionsAction === 'rebuild') {
    return 'rebuild'
  }

  const calcFields = viewCalcFields(input.view)
  const groupField = input.view.group?.field

  for (const item of input.delta.semantics) {
    switch (item.kind) {
      case 'view.calculations':
        if (item.viewId === input.activeViewId) {
          return 'rebuild'
        }
        break
      case 'field.schema':
        if (calcFields.has(item.fieldId) || item.fieldId === groupField) {
          return 'rebuild'
        }
        break
      default:
        break
    }
  }

  if (input.sectionsAction === 'sync') {
    return 'sync'
  }

  const touchedFields = collectTouchedFields(input.delta)
  if (touchedFields === 'all') {
    return calcFields.size > 0
      ? 'sync'
      : 'reuse'
  }

  const changedFields = new Set<FieldId>(touchedFields)
  if (changedFields.size > 0 && hasIntersection(calcFields, changedFields)) {
    return 'sync'
  }

  for (const item of input.delta.semantics) {
    if (
      item.kind === 'record.patch'
      && item.aspects.includes('title')
      && calcFields.has(TITLE_FIELD_ID)
    ) {
      return 'sync'
    }
  }

  return 'reuse'
}

export const runSummaryStage = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  delta: CommitDelta
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
  const touchedRecords = collectTouchedRecordIds(input.delta)
  const touchedFields = collectTouchedFields(input.delta)
  const action = resolveSummaryAction({
    activeViewId: input.activeViewId,
    previousViewId: input.previousViewId,
    delta: input.delta,
    view: input.view,
    previous: input.previous,
    previousSections: input.previousSections,
    sectionsAction: input.sectionsAction
  })
  const deriveStart = now()
  const state = syncSummaryState({
    previous: input.previous,
    previousSections: input.previousSections,
    sections: input.sections,
    view: input.view,
    index: input.index,
    action,
    touchedRecords,
    touchedFields
  })
  const deriveMs = now() - deriveStart

  if (
    action === 'reuse'
    && state === input.previous
    && input.previousPublished
  ) {
    return {
      action,
      state,
      summaries: input.previousPublished,
      deriveMs,
      publishMs: 0
    }
  }

  const publishStart = now()
  const summaries = publishSummaries({
    summary: state,
    previousSummary: input.previous,
    previous: input.previousPublished,
    fieldsById: input.fieldsById,
    view: input.view
  })
  const publishMs = now() - publishStart

  return {
    action,
    state,
    summaries,
    deriveMs,
    publishMs
  }
}
