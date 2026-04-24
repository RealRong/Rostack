import {
  dataviewTrace
} from '@dataview/core/mutation'
import type {
  ViewQueryAspect
} from '@dataview/core/contracts/commit'
import {
  hasCalculationChanges,
  hasMembershipChanges
} from '@dataview/engine/active/shared/transition'
import {
  createPlan,
  mergePlans,
  type ProjectorPlanner
} from '@shared/projector'
import type { ViewState } from '@dataview/engine/contracts/view'
import type {
  ActivePhaseScopeMap,
  ActivePhaseName,
  ActiveProjectorRunInput
} from '../contracts/projector'
import { createPublishPhaseScope } from './scopes/publishScope'

const hasField = (
  fields: ReadonlySet<string> | 'all',
  fieldId: string
): boolean => fields === 'all'
  ? true
  : fields.has(fieldId)

const hasAnyField = (
  fields: ReadonlySet<string> | 'all',
  candidates: readonly string[]
): boolean => fields === 'all'
  ? candidates.length > 0
  : candidates.some(fieldId => fields.has(fieldId))

const hasQueryFieldChange = (
  input: ActiveProjectorRunInput
): boolean => {
  const { plan } = input.view
  if (!plan) {
    return false
  }

  const touchedFields = input.impact.touchedFields
  if (touchedFields === 'all') {
    return true
  }

  if (
    hasAnyField(touchedFields, plan.query.watch.filter)
    || hasAnyField(touchedFields, plan.query.watch.sort)
  ) {
    return true
  }

  if (plan.query.watch.search === 'all') {
    return touchedFields.size > 0 || input.impact.schemaFields.size > 0
  }

  return hasAnyField(touchedFields, plan.query.watch.search)
}

const hasQuerySchemaChange = (
  input: ActiveProjectorRunInput
): boolean => {
  const { plan } = input.view
  if (!plan || input.impact.schemaFields.size === 0) {
    return false
  }

  if (
    hasAnyField(input.impact.schemaFields, plan.query.watch.filter)
    || hasAnyField(input.impact.schemaFields, plan.query.watch.sort)
  ) {
    return true
  }

  if (plan.query.watch.search === 'all') {
    return true
  }

  return hasAnyField(input.impact.schemaFields, plan.query.watch.search)
}

const hasPublishSchemaChange = (
  input: ActiveProjectorRunInput
): boolean => {
  const { plan } = input.view
  if (!plan || input.impact.schemaFields.size === 0) {
    return false
  }

  const groupFieldId = plan.section?.fieldId

  return plan.index.recordFields.some(fieldId => (
    input.impact.schemaFields.has(fieldId)
    && !plan.query.watch.filter.includes(fieldId)
    && !plan.query.watch.sort.includes(fieldId)
    && plan.query.watch.search !== 'all'
    && !plan.query.watch.search.includes(fieldId)
    && groupFieldId !== fieldId
    && !plan.calcFields.includes(fieldId)
  ))
}

const sectionChanged = (
  input: ActiveProjectorRunInput
): boolean => {
  const previous = input.view.previousPlan?.section
  const next = input.view.plan?.section
  if (!previous || !next) {
    return previous !== next
  }

  return previous.fieldId !== next.fieldId
    || previous.mode !== next.mode
    || previous.sort !== next.sort
    || previous.interval !== next.interval
    || previous.showEmpty !== next.showEmpty
}

const calculationFieldsChanged = (
  input: ActiveProjectorRunInput
): boolean => {
  const previous = input.view.previousPlan?.calcFields ?? EMPTY_FIELDS
  const next = input.view.plan?.calcFields ?? EMPTY_FIELDS
  if (previous.length !== next.length) {
    return true
  }

  return previous.some((fieldId, index) => fieldId !== next[index])
}

const EMPTY_FIELDS = [] as const
const QUERY_ASPECTS = [
  'search',
  'filter',
  'sort',
  'order'
] as const satisfies readonly ViewQueryAspect[]

const readPlannerState = (
  input: ActiveProjectorRunInput
) => ({
  activeViewId: input.read.reader.views.activeId(),
  activeView: input.read.reader.views.active(),
  plan: input.view.plan
})

const createEmptyPlan = () => createPlan<ActivePhaseName, ActivePhaseScopeMap>()

const planReset = (
  input: ActiveProjectorRunInput,
  previous: ViewState | undefined
) => {
  const {
    activeViewId,
    activeView,
    plan
  } = readPlannerState(input)

  if (activeViewId && activeView && plan) {
    return createEmptyPlan()
  }

  return previous
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        scope: {
          publish: createPublishPhaseScope({
            reset: true
          })
        }
      })
    : createEmptyPlan()
}

const planQuery = (
  input: ActiveProjectorRunInput,
  previous: ViewState | undefined
) => {
  const {
    activeViewId,
    activeView,
    plan
  } = readPlannerState(input)

  if (!activeViewId || !activeView || !plan) {
    return createEmptyPlan()
  }

  const viewChange = dataviewTrace.view.change(
    input.impact.trace,
    activeViewId
  )
  const shouldRun = (
    !previous
    || previous.view.id !== activeViewId
    || dataviewTrace.has.activeView(input.impact.trace)
    || QUERY_ASPECTS.some((aspect) => viewChange?.queryAspects?.has(aspect))
    || input.view.previousPlan?.query.executionKey !== plan.query.executionKey
    || input.impact.recordSetChanged
    || hasQuerySchemaChange(input)
    || hasQueryFieldChange(input)
  )

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['query']
      })
    : createEmptyPlan()
}

const planMembership = (
  input: ActiveProjectorRunInput
) => {
  const {
    activeViewId,
    activeView,
    plan
  } = readPlannerState(input)

  if (!activeViewId || !activeView || !plan) {
    return createEmptyPlan()
  }

  const viewChange = dataviewTrace.view.change(
    input.impact.trace,
    activeViewId
  )
  const shouldRun = (
    viewChange?.queryAspects?.has('group') === true
    || Boolean(
      plan.section
      && (
        sectionChanged(input)
        || hasField(input.impact.touchedFields, plan.section.fieldId)
        || input.impact.schemaFields.has(plan.section.fieldId)
        || hasMembershipChanges(input.index.delta?.bucket)
        || input.index.delta?.bucket?.rebuild
      )
    )
  )

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['membership']
      })
    : createEmptyPlan()
}

const planSummary = (
  input: ActiveProjectorRunInput
) => {
  const {
    activeViewId,
    activeView,
    plan
  } = readPlannerState(input)

  if (!activeViewId || !activeView || !plan) {
    return createEmptyPlan()
  }

  const viewChange = dataviewTrace.view.change(
    input.impact.trace,
    activeViewId
  )
  const shouldRun = (
    Boolean(viewChange?.calculationFields)
    || Boolean(
      plan.calcFields.length
      && (
        calculationFieldsChanged(input)
        || hasCalculationChanges(input.index.delta?.calculation, plan.calcFields)
      )
    )
  )

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['summary']
      })
    : createEmptyPlan()
}

const planPublish = (
  input: ActiveProjectorRunInput
) => {
  const {
    activeViewId,
    activeView,
    plan
  } = readPlannerState(input)

  if (!activeViewId || !activeView || !plan) {
    return createEmptyPlan()
  }

  const viewChange = dataviewTrace.view.change(
    input.impact.trace,
    activeViewId
  )
  const shouldRun = (
    viewChange?.queryAspects?.has('group') === true
    || QUERY_ASPECTS.some((aspect) => viewChange?.queryAspects?.has(aspect))
    || Boolean(viewChange?.calculationFields)
    || Boolean(viewChange?.layoutAspects?.size)
    || hasPublishSchemaChange(input)
  )

  return shouldRun
    ? createPlan<ActivePhaseName, ActivePhaseScopeMap>({
        phases: ['publish']
      })
    : createEmptyPlan()
}

export const activeProjectorPlanner: ProjectorPlanner<
  ActiveProjectorRunInput,
  ViewState | undefined,
  ActivePhaseName,
  ActivePhaseScopeMap
> = {
  plan: ({ input, previous }) => mergePlans(
    planReset(input, previous),
    planQuery(input, previous),
    planMembership(input),
    planSummary(input),
    planPublish(input)
  )
}
