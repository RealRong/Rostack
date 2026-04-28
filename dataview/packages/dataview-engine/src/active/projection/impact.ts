import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'
import type {
  FieldSchemaAspect,
  ViewQueryAspect
} from '@dataview/core/types'
import type {
  QueryPlan,
  ViewPlan
} from '@dataview/engine/active/plan'
import type {
  QueryPhaseDelta
} from '@dataview/engine/active/state'
import type {
  MutationDelta
} from '@shared/mutation'
import {
  hasDeltaChange,
  readChangeIds,
  readChangePaths,
  readChangePayload,
  readMutationChange
} from '@dataview/engine/mutation/delta'

const EMPTY_FIELDS = [] as const
const EMPTY_SET = new Set<never>()

const collectIds = <T extends string>(
  ...values: Array<readonly T[] | 'all' | undefined>
): ReadonlySet<T> | 'all' => {
  let all = false
  const result = new Set<T>()

  values.forEach((value) => {
    if (value === 'all') {
      all = true
      return
    }

    value?.forEach((id) => {
      result.add(id)
    })
  })

  return all
    ? 'all'
    : result
}

const collectPathFieldIds = (
  paths: Record<string, readonly string[] | 'all'> | 'all' | undefined
): ReadonlySet<FieldId> | 'all' => {
  if (paths === 'all') {
    return 'all'
  }

  const fields = new Set<FieldId>()
  Object.values(paths ?? {}).forEach((value) => {
    if (value === 'all') {
      fields.add('title')
      return
    }

    value.forEach((path) => {
      const [fieldId] = path.split('.')
      if (fieldId) {
        fields.add(fieldId as FieldId)
      }
    })
  })
  return fields
}

const collectFieldAspectIds = (
  input: Record<string, readonly FieldSchemaAspect[]> | undefined
): ReadonlySet<FieldId> => new Set(
  input
    ? Object.keys(input) as FieldId[]
    : []
)

const collectQueryViewIds = (
  delta: MutationDelta
): ReadonlySet<ViewId> | 'all' => collectIds<ViewId>(
  readChangeIds(readMutationChange(delta, 'view.query')) as readonly ViewId[] | 'all' | undefined
)

const collectCalculationViewMap = (
  delta: MutationDelta
): ReadonlyMap<ViewId, ReadonlySet<FieldId> | 'all'> => {
  const change = readMutationChange(delta, 'view.calc')
  const payload = readChangePayload<Record<string, readonly FieldId[] | 'all'>>(
    change,
    'viewCalculationFields'
  )
  const result = new Map<ViewId, ReadonlySet<FieldId> | 'all'>()

  Object.entries(payload ?? {}).forEach(([viewId, fieldIds]) => {
    result.set(
      viewId as ViewId,
      fieldIds === 'all'
        ? 'all'
        : new Set(fieldIds)
    )
  })

  return result
}

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
  delta: MutationDelta
  reset: boolean
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  touchedViews: ReadonlySet<ViewId> | 'all'
  recordSetChanged: boolean
  activeViewChanged: boolean
  queryChangedViews: ReadonlySet<ViewId> | 'all'
  calculationChangedViews: ReadonlyMap<ViewId, ReadonlySet<FieldId> | 'all'>
}

export const createBaseImpact = (
  delta: MutationDelta
): BaseImpact => ({
  delta,
  reset: delta.reset === true,
  touchedRecords: collectIds<RecordId>(
    readChangeIds(readMutationChange(delta, 'record.create')) as readonly RecordId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'record.patch')) as readonly RecordId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'record.delete')) as readonly RecordId[] | 'all' | undefined,
    (() => {
      const paths = readChangePaths(readMutationChange(delta, 'record.values'))
      return paths === 'all'
        ? 'all'
        : paths
          ? Object.keys(paths) as RecordId[]
          : undefined
    })()
  ),
  touchedFields: collectIds<FieldId>(
    readChangeIds(readMutationChange(delta, 'field.create')) as readonly FieldId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'field.delete')) as readonly FieldId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'field.schema')) as readonly FieldId[] | 'all' | undefined,
    (() => {
      const valueFields = collectPathFieldIds(readChangePaths(readMutationChange(delta, 'record.values')))
      return valueFields === 'all'
        ? 'all'
        : [...valueFields]
    })()
  ),
  valueFields: collectPathFieldIds(readChangePaths(readMutationChange(delta, 'record.values'))),
  schemaFields: collectFieldAspectIds(
    readChangePayload<Record<string, readonly FieldSchemaAspect[]>>(
      readMutationChange(delta, 'field.schema'),
      'fieldAspects'
    )
  ),
  touchedViews: collectIds<ViewId>(
    readChangeIds(readMutationChange(delta, 'view.create')) as readonly ViewId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'view.query')) as readonly ViewId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'view.layout')) as readonly ViewId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'view.calc')) as readonly ViewId[] | 'all' | undefined,
    readChangeIds(readMutationChange(delta, 'view.delete')) as readonly ViewId[] | 'all' | undefined
  ),
  recordSetChanged: hasDeltaChange(delta, 'record.create')
    || hasDeltaChange(delta, 'record.delete'),
  activeViewChanged: hasDeltaChange(delta, 'document.activeView'),
  queryChangedViews: collectQueryViewIds(delta),
  calculationChangedViews: collectCalculationViewMap(delta)
})

export const hasActiveViewChange = (
  impact: BaseImpact
): boolean => impact.reset || impact.activeViewChanged

export const hasFieldSchemaChange = (
  impact: BaseImpact,
  fieldId: FieldId
): boolean => impact.reset || impact.schemaFields.has(fieldId)

export const hasViewQueryChange = (
  impact: BaseImpact,
  viewId: ViewId,
  aspects?: readonly ViewQueryAspect[]
): boolean => {
  if (impact.reset) {
    return true
  }

  const change = readMutationChange(impact.delta, 'view.query')
  const ids = readChangeIds(change)
  if (ids !== 'all' && ids && !ids.includes(viewId)) {
    return false
  }
  if (!ids && !readChangePayload(change, 'viewQueryAspects')) {
    return false
  }
  if (!aspects?.length) {
    return true
  }

  const byView = readChangePayload<Record<string, readonly ViewQueryAspect[]>>(
    change,
    'viewQueryAspects'
  )
  const current = byView?.[viewId]
  if (!current?.length) {
    return false
  }

  return aspects.some((aspect) => current.includes(aspect))
}

export const hasViewCalculationChanges = (
  impact: BaseImpact,
  viewId: ViewId
): boolean => {
  if (impact.reset) {
    return true
  }

  const changed = impact.calculationChangedViews.get(viewId)
  return changed === 'all'
    || (changed instanceof Set && changed.size > 0)
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
