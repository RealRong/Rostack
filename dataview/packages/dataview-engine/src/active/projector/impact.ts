import {
  dataviewTrace,
  type DataviewTrace
} from '@dataview/core/mutation'
import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  QueryPlan,
  ViewPlan
} from '@dataview/engine/active/plan'
import type {
  QueryPhaseDelta
} from '@dataview/engine/active/state'

const EMPTY_FIELDS = [] as const

const hasAnyField = (
  fields: ReadonlySet<FieldId> | 'all',
  candidates: readonly FieldId[]
): boolean => fields === 'all'
  ? candidates.length > 0
  : candidates.some(fieldId => fields.has(fieldId))

export const hasField = (
  fields: ReadonlySet<FieldId> | 'all',
  fieldId: FieldId
): boolean => fields === 'all'
  ? true
  : fields.has(fieldId)

export interface BaseImpact {
  trace: DataviewTrace
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  recordSetChanged: boolean
}

export const createBaseImpact = (
  trace: DataviewTrace
): BaseImpact => ({
  trace,
  touchedRecords: dataviewTrace.record.touchedIds(trace),
  touchedFields: dataviewTrace.field.touchedIds(trace),
  valueFields: dataviewTrace.field.valueIds(trace),
  schemaFields: dataviewTrace.field.schemaIds(trace),
  recordSetChanged: dataviewTrace.has.recordSetChange(trace)
})

export const sectionChanged = (input: {
  previousPlan?: ViewPlan
  plan?: ViewPlan
}): boolean => {
  const previous = input.previousPlan?.section
  const next = input.plan?.section
  if (!previous || !next) {
    return previous !== next
  }

  return previous.fieldId !== next.fieldId
    || previous.mode !== next.mode
    || previous.sort !== next.sort
    || previous.interval !== next.interval
    || previous.showEmpty !== next.showEmpty
}

export const calculationFieldsChanged = (input: {
  previousPlan?: ViewPlan
  plan?: ViewPlan
}): boolean => {
  const previous = input.previousPlan?.calcFields ?? EMPTY_FIELDS
  const next = input.plan?.calcFields ?? EMPTY_FIELDS
  if (previous.length !== next.length) {
    return true
  }

  return previous.some((fieldId, index) => fieldId !== next[index])
}

export const hasQuerySchemaChanges = (input: {
  impact: BaseImpact
  plan: QueryPlan
}): boolean => {
  if (input.impact.schemaFields.size === 0) {
    return false
  }

  if (
    hasAnyField(input.impact.schemaFields, input.plan.watch.filter)
    || hasAnyField(input.impact.schemaFields, input.plan.watch.sort)
  ) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    return true
  }

  return hasAnyField(input.impact.schemaFields, input.plan.watch.search)
}

export const hasQueryFieldChanges = (input: {
  impact: BaseImpact
  plan: QueryPlan
}): boolean => {
  const touchedFields = input.impact.touchedFields
  if (touchedFields === 'all') {
    return true
  }

  if (
    hasAnyField(touchedFields, input.plan.watch.filter)
    || hasAnyField(touchedFields, input.plan.watch.sort)
  ) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    return touchedFields.size > 0 || input.impact.schemaFields.size > 0
  }

  return hasAnyField(touchedFields, input.plan.watch.search)
}

export const hasQueryInputChanges = (input: {
  impact: BaseImpact
  plan: QueryPlan
}): boolean => input.impact.recordSetChanged
  || hasQuerySchemaChanges(input)
  || hasQueryFieldChanges(input)

export const hasPublishSchemaChanges = (input: {
  impact: BaseImpact
  plan: ViewPlan
}): boolean => {
  if (input.impact.schemaFields.size === 0) {
    return false
  }

  const groupFieldId = input.plan.section?.fieldId

  return input.plan.index.recordFields.some(fieldId => (
    input.impact.schemaFields.has(fieldId)
    && !input.plan.query.watch.filter.includes(fieldId)
    && !input.plan.query.watch.sort.includes(fieldId)
    && input.plan.query.watch.search !== 'all'
    && !input.plan.query.watch.search.includes(fieldId)
    && groupFieldId !== fieldId
    && !input.plan.calcFields.includes(fieldId)
  ))
}

export const hasQueryDeltaChanges = (
  delta: QueryPhaseDelta
): boolean => Boolean(
  delta.rebuild
  || delta.orderChanged
  || delta.added.length
  || delta.removed.length
)
