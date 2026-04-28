import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'
import type {
  FieldSchemaAspect,
  ViewQueryAspect
} from '@dataview/core/types/commit'
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

const hasAnyField = (
  fields: ReadonlySet<FieldId> | 'all',
  candidates: readonly FieldId[]
): boolean => fields === 'all'
  ? candidates.length > 0
  : candidates.some(fieldId => fields.has(fieldId))

export const readTouchedRecords = (
  delta: MutationDelta
): ReadonlySet<RecordId> | 'all' => collectIds<RecordId>(
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
)

export const readTouchedFields = (
  delta: MutationDelta
): ReadonlySet<FieldId> | 'all' => collectIds<FieldId>(
  readChangeIds(readMutationChange(delta, 'field.create')) as readonly FieldId[] | 'all' | undefined,
  readChangeIds(readMutationChange(delta, 'field.delete')) as readonly FieldId[] | 'all' | undefined,
  readChangeIds(readMutationChange(delta, 'field.schema')) as readonly FieldId[] | 'all' | undefined,
  (() => {
    const valueFields = readValueFields(delta)
    return valueFields === 'all'
      ? 'all'
      : [...valueFields]
  })()
)

export const readValueFields = (
  delta: MutationDelta
): ReadonlySet<FieldId> | 'all' => collectPathFieldIds(
  readChangePaths(readMutationChange(delta, 'record.values'))
)

export const readSchemaFields = (
  delta: MutationDelta
): ReadonlySet<FieldId> => collectFieldAspectIds(
  readChangePayload<Record<string, readonly FieldSchemaAspect[]>>(
    readMutationChange(delta, 'field.schema'),
    'fieldAspects'
  )
)

export const readTouchedViews = (
  delta: MutationDelta
): ReadonlySet<ViewId> | 'all' => collectIds<ViewId>(
  readChangeIds(readMutationChange(delta, 'view.create')) as readonly ViewId[] | 'all' | undefined,
  readChangeIds(readMutationChange(delta, 'view.query')) as readonly ViewId[] | 'all' | undefined,
  readChangeIds(readMutationChange(delta, 'view.layout')) as readonly ViewId[] | 'all' | undefined,
  readChangeIds(readMutationChange(delta, 'view.calc')) as readonly ViewId[] | 'all' | undefined,
  readChangeIds(readMutationChange(delta, 'view.delete')) as readonly ViewId[] | 'all' | undefined
)

export const hasRecordSetChange = (
  delta: MutationDelta
): boolean => hasDeltaChange(delta, 'record.create')
  || hasDeltaChange(delta, 'record.delete')

export const hasActiveViewChange = (
  delta: MutationDelta
): boolean => delta.reset === true
  || hasDeltaChange(delta, 'document.activeView')

export const hasField = (
  fields: ReadonlySet<FieldId> | 'all',
  fieldId: FieldId
): boolean => fields === 'all'
  ? true
  : fields.has(fieldId)

export const hasFieldSchemaChange = (
  delta: MutationDelta,
  fieldId: FieldId
): boolean => delta.reset === true
  || readSchemaFields(delta).has(fieldId)

export const hasViewQueryChange = (
  delta: MutationDelta,
  viewId: ViewId,
  aspects?: readonly ViewQueryAspect[]
): boolean => {
  if (delta.reset === true) {
    return true
  }

  const change = readMutationChange(delta, 'view.query')
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
  delta: MutationDelta,
  viewId: ViewId
): boolean => {
  if (delta.reset === true) {
    return true
  }

  const change = readMutationChange(delta, 'view.calc')
  const payload = readChangePayload<Record<string, readonly FieldId[] | 'all'>>(
    change,
    'viewCalculationFields'
  )
  const changed = payload?.[viewId]
  return changed === 'all'
    || (Array.isArray(changed) && changed.length > 0)
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
  delta: MutationDelta
  plan: QueryPlan
}): boolean => {
  const schemaFields = readSchemaFields(input.delta)
  if (schemaFields.size === 0) {
    return false
  }

  if (
    hasAnyField(schemaFields, input.plan.watch.filter)
    || hasAnyField(schemaFields, input.plan.watch.sort)
  ) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    return true
  }

  return hasAnyField(schemaFields, input.plan.watch.search)
}

export const hasQueryFieldChanges = (input: {
  delta: MutationDelta
  plan: QueryPlan
}): boolean => {
  const touchedFields = readTouchedFields(input.delta)
  const schemaFields = readSchemaFields(input.delta)

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
    return touchedFields.size > 0 || schemaFields.size > 0
  }

  return hasAnyField(touchedFields, input.plan.watch.search)
}

export const hasQueryInputChanges = (input: {
  delta: MutationDelta
  plan: QueryPlan
}): boolean => hasRecordSetChange(input.delta)
  || hasQuerySchemaChanges(input)
  || hasQueryFieldChanges(input)

export const hasQueryDeltaChanges = (
  delta: QueryPhaseDelta
): boolean => Boolean(
  delta.rebuild
  || delta.orderChanged
  || delta.added.length
  || delta.removed.length
)
