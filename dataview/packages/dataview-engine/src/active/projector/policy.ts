import {
  dataviewTrace
} from '@dataview/core/mutation'
import type {
  ViewQueryAspect
} from '@dataview/core/contracts/commit'
import type {
  FieldId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  IndexDelta
} from '@dataview/engine/active/index/contracts'
import type {
  QueryPlan,
  ViewPlan
} from '@dataview/engine/active/plan'
import {
  hasCalculationChanges,
  hasMembershipChanges
} from '@dataview/engine/active/shared/transition'
import type {
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import type {
  MembershipPhaseDelta,
  MembershipPhaseState,
  PhaseAction,
  QueryPhaseDelta,
  QueryPhaseState,
  SummaryPhaseState
} from '@dataview/engine/active/state'
import type { ViewState } from '@dataview/engine/contracts/view'
import {
  resolveSummaryTouchedSections
} from '@dataview/engine/active/summary/derive'
import type { ActiveProjectorInput } from '../contracts/projector'

const EMPTY_FIELDS = [] as const
const QUERY_ASPECTS = [
  'search',
  'filter',
  'sort',
  'order'
] as const satisfies readonly ViewQueryAspect[]

const hasField = (
  fields: ReadonlySet<FieldId> | 'all',
  fieldId: FieldId
): boolean => fields === 'all'
  ? true
  : fields.has(fieldId)

const hasAnyField = (
  fields: ReadonlySet<FieldId> | 'all',
  candidates: readonly FieldId[]
): boolean => fields === 'all'
  ? candidates.length > 0
  : candidates.some(fieldId => fields.has(fieldId))

export interface ActiveProjectionContext {
  activeViewId?: ViewId
  view?: View
  plan?: ViewPlan
  previous?: ViewState
  previousViewId?: ViewId
  previousPlan?: ViewPlan
}

export const readActiveProjectionContext = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
): ActiveProjectionContext => ({
  activeViewId: input.read.reader.views.activeId(),
  view: input.read.reader.views.active(),
  plan: input.view.plan,
  previous,
  previousViewId: previous?.view.id,
  previousPlan: input.view.previousPlan
})

export const shouldResetActiveProjection = (
  context: ActiveProjectionContext
): boolean => !context.activeViewId
  || !context.view
  || !context.plan

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

export const resolveQueryPlanPolicy = (input: {
  context: ActiveProjectionContext
  projector: ActiveProjectorInput
}): {
  shouldRun: boolean
} => {
  const {
    activeViewId,
    plan,
    previous,
    previousViewId,
    previousPlan
  } = input.context
  if (shouldResetActiveProjection(input.context) || !activeViewId || !plan) {
    return {
      shouldRun: false
    }
  }

  const viewChange = dataviewTrace.view.change(
    input.projector.impact.trace,
    activeViewId
  )

  return {
    shouldRun: (
      !previous
      || previousViewId !== activeViewId
      || dataviewTrace.has.activeView(input.projector.impact.trace)
      || QUERY_ASPECTS.some((aspect) => viewChange?.queryAspects?.has(aspect))
      || previousPlan?.query.executionKey !== plan.query.executionKey
      || hasQueryInputChanges({
        impact: input.projector.impact,
        plan: plan.query
      })
    )
  }
}

export const resolveMembershipPlanPolicy = (input: {
  context: ActiveProjectionContext
  projector: ActiveProjectorInput
}): {
  shouldRun: boolean
} => {
  const {
    activeViewId,
    plan,
    previousPlan
  } = input.context
  if (shouldResetActiveProjection(input.context) || !activeViewId || !plan) {
    return {
      shouldRun: false
    }
  }

  const viewChange = dataviewTrace.view.change(
    input.projector.impact.trace,
    activeViewId
  )

  return {
    shouldRun: (
      viewChange?.queryAspects?.has('group') === true
      || Boolean(
        plan.section
        && (
          sectionChanged({
            previousPlan,
            plan
          })
          || hasField(input.projector.impact.touchedFields, plan.section.fieldId)
          || input.projector.impact.schemaFields.has(plan.section.fieldId)
          || hasMembershipChanges(input.projector.index.delta?.bucket)
        )
      )
    )
  }
}

export const resolveSummaryPlanPolicy = (input: {
  context: ActiveProjectionContext
  projector: ActiveProjectorInput
}): {
  shouldRun: boolean
} => {
  const {
    activeViewId,
    plan,
    previousPlan
  } = input.context
  if (shouldResetActiveProjection(input.context) || !activeViewId || !plan) {
    return {
      shouldRun: false
    }
  }

  const viewChange = dataviewTrace.view.change(
    input.projector.impact.trace,
    activeViewId
  )

  return {
    shouldRun: (
      Boolean(viewChange?.calculationFields)
      || Boolean(
        plan.calcFields.length
        && (
          calculationFieldsChanged({
            previousPlan,
            plan
          })
          || hasCalculationChanges(
            input.projector.index.delta?.calculation,
            plan.calcFields
          )
        )
      )
    )
  }
}

export const resolvePublishPlanPolicy = (input: {
  context: ActiveProjectionContext
  projector: ActiveProjectorInput
}): {
  shouldRun: boolean
} => {
  const {
    activeViewId,
    plan
  } = input.context
  if (shouldResetActiveProjection(input.context) || !activeViewId || !plan) {
    return {
      shouldRun: false
    }
  }

  const viewChange = dataviewTrace.view.change(
    input.projector.impact.trace,
    activeViewId
  )

  return {
    shouldRun: (
      viewChange?.queryAspects?.has('group') === true
      || QUERY_ASPECTS.some((aspect) => viewChange?.queryAspects?.has(aspect))
      || Boolean(viewChange?.calculationFields)
      || Boolean(viewChange?.layoutAspects?.size)
      || hasPublishSchemaChanges({
        impact: input.projector.impact,
        plan
      })
    )
  }
}

export const resolveQueryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  previousPlan?: QueryPlan
  plan: QueryPlan
  previous?: QueryPhaseState
}): PhaseAction => {
  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || dataviewTrace.has.activeView(input.impact.trace)
  ) {
    return 'rebuild'
  }

  if (
    input.previousPlan?.executionKey !== input.plan.executionKey
    || hasQueryInputChanges({
      impact: input.impact,
      plan: input.plan
    })
  ) {
    return 'sync'
  }

  return 'reuse'
}

export const hasQueryDeltaChanges = (
  delta: QueryPhaseDelta
): boolean => Boolean(
  delta.rebuild
  || delta.orderChanged
  || delta.added.length
  || delta.removed.length
)

export const resolveMembershipAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
  view: View
  previous?: MembershipPhaseState
  queryDelta: QueryPhaseDelta
  indexDelta?: IndexDelta
}): PhaseAction => {
  if (
    !input.previous
    || input.previousViewId !== input.activeViewId
    || dataviewTrace.has.activeView(input.impact.trace)
  ) {
    return 'rebuild'
  }

  if (input.queryDelta.rebuild || input.indexDelta?.bucket?.rebuild) {
    return 'rebuild'
  }

  const groupField = input.view.group?.fieldId
  if (!groupField) {
    return hasQueryDeltaChanges(input.queryDelta)
      ? 'sync'
      : 'reuse'
  }

  if (
    dataviewTrace.has.viewQuery(input.impact.trace, input.activeViewId, ['group'])
    || dataviewTrace.has.fieldSchema(input.impact.trace, groupField)
    || dataviewTrace.has.recordSetChange(input.impact.trace)
  ) {
    return 'rebuild'
  }

  const touchedFields = input.impact.touchedFields
  if (touchedFields === 'all' || touchedFields.has(groupField)) {
    return 'sync'
  }

  return hasQueryDeltaChanges(input.queryDelta) || hasMembershipChanges(input.indexDelta?.bucket)
    ? 'sync'
    : 'reuse'
}

export const resolveSummaryAction = (input: {
  activeViewId: ViewId
  previousViewId?: ViewId
  impact: BaseImpact
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
    || dataviewTrace.has.activeView(input.impact.trace)
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
  const viewChange = dataviewTrace.view.change(input.impact.trace, input.activeViewId)

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

    if (dataviewTrace.has.fieldSchema(input.impact.trace, fieldId)) {
      return {
        action: 'rebuild'
      }
    }
  }

  if (groupField && dataviewTrace.has.fieldSchema(input.impact.trace, groupField)) {
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
