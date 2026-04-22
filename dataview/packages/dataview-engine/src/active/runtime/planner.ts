import { impact as commitImpact } from '@dataview/core/commit/impact'
import type {
  ViewQueryAspect
} from '@dataview/core/contracts/commit'
import {
  hasCalculationChanges,
  hasMembershipChanges
} from '@dataview/engine/active/shared/transition'
import {
  createPlan,
  type RuntimePlanner
} from '@shared/projection-runtime'
import type { ViewState } from '@dataview/engine/contracts'
import type {
  ActivePhaseName,
  ActiveRuntimeRunInput
} from './runtime'

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
  input: ActiveRuntimeRunInput
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
  input: ActiveRuntimeRunInput
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
  input: ActiveRuntimeRunInput
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
  input: ActiveRuntimeRunInput
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
  input: ActiveRuntimeRunInput
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

export const createActiveRuntimePlanner = (): RuntimePlanner<
  ActiveRuntimeRunInput,
  ViewState | undefined,
  ActivePhaseName
> => ({
  plan: ({ input, previous }) => {
    const activeViewId = input.read.reader.views.activeId()
    const activeView = input.read.reader.views.active()
    const plan = input.view.plan
    const phases = new Set<ActivePhaseName>()

    if (!activeViewId || !activeView || !plan) {
      return previous
        ? createPlan<ActivePhaseName>({
            phases: ['publish']
          })
        : createPlan<ActivePhaseName>()
    }

    const viewChange = commitImpact.view.change(
      input.impact.commit,
      activeViewId
    )

    if (
      !previous
      || previous.view.id !== activeViewId
    ) {
      phases.add('query')
    }

    if (commitImpact.has.activeView(input.impact.commit)) {
      phases.add('query')
    }

    if (viewChange?.queryAspects?.has('group')) {
      phases.add('membership')
      phases.add('publish')
    }

    if (QUERY_ASPECTS.some(aspect => viewChange?.queryAspects?.has(aspect))) {
      phases.add('query')
      phases.add('publish')
    }

    if (viewChange?.calculationFields) {
      phases.add('summary')
      phases.add('publish')
    }

    if (viewChange?.layoutAspects?.size) {
      phases.add('publish')
    }

    if (
      input.view.previousPlan?.query.executionKey !== plan.query.executionKey
      || input.impact.recordSetChanged
      || hasQuerySchemaChange(input)
      || hasQueryFieldChange(input)
    ) {
      phases.add('query')
    }

    if (
      plan.section
      && (
        sectionChanged(input)
        || hasField(input.impact.touchedFields, plan.section.fieldId)
        || input.impact.schemaFields.has(plan.section.fieldId)
        || hasMembershipChanges(input.index.delta?.bucket)
        || input.index.delta?.bucket?.rebuild
      )
    ) {
      phases.add('membership')
    }

    if (
      plan.calcFields.length
      && (
        calculationFieldsChanged(input)
        || hasCalculationChanges(input.index.delta?.calculation, plan.calcFields)
      )
    ) {
      phases.add('summary')
    }

    if (hasPublishSchemaChange(input)) {
      phases.add('publish')
    }

    return createPlan<ActivePhaseName>({
      phases
    })
  }
})
