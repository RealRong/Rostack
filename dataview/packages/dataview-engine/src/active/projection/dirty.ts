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
  MutationChange,
  MutationDelta
} from '@shared/mutation'

const EMPTY_FIELDS = [] as const

const readIds = <TId extends string>(
  change: MutationChange | undefined
): readonly TId[] | 'all' | undefined => {
  if (change?.ids !== undefined) {
    return change.ids as readonly TId[] | 'all'
  }

  if (change?.paths === 'all') {
    return 'all'
  }

  return change?.paths
    ? Object.keys(change.paths) as TId[]
    : undefined
}

const readPaths = (
  change: MutationChange | undefined
): Readonly<Record<string, readonly string[] | 'all'>> | 'all' | undefined => (
  change?.paths
)

const readPayload = <T,>(
  change: MutationChange | undefined,
  key: string
): T | undefined => change?.[key] as T | undefined

const hasChange = (
  delta: MutationDelta,
  key: string
): boolean => delta.changes.has(key)

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
  readIds<RecordId>(delta.changes.get('record.create')),
  readIds<RecordId>(delta.changes.get('record.patch')),
  readIds<RecordId>(delta.changes.get('record.delete')),
  (() => {
    const paths = readPaths(delta.changes.get('record.values'))
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
  readIds<FieldId>(delta.changes.get('field.create')),
  readIds<FieldId>(delta.changes.get('field.delete')),
  readIds<FieldId>(delta.changes.get('field.schema')),
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
  readPaths(delta.changes.get('record.values'))
)

export const readSchemaFields = (
  delta: MutationDelta
): ReadonlySet<FieldId> => collectFieldAspectIds(
  readPayload<Record<string, readonly FieldSchemaAspect[]>>(
    delta.changes.get('field.schema'),
    'fieldAspects'
  )
)

export const readTouchedViews = (
  delta: MutationDelta
): ReadonlySet<ViewId> | 'all' => collectIds<ViewId>(
  readIds<ViewId>(delta.changes.get('view.create')),
  readIds<ViewId>(delta.changes.get('view.query')),
  readIds<ViewId>(delta.changes.get('view.layout')),
  readIds<ViewId>(delta.changes.get('view.calc')),
  readIds<ViewId>(delta.changes.get('view.delete'))
)

export const hasRecordSetChange = (
  delta: MutationDelta
): boolean => hasChange(delta, 'record.create')
  || hasChange(delta, 'record.delete')

export const hasActiveViewChange = (
  delta: MutationDelta
): boolean => delta.reset === true
  || hasChange(delta, 'document.activeView')

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

  const change = delta.changes.get('view.query')
  const ids = readIds<ViewId>(change)
  if (ids !== 'all' && ids && !ids.includes(viewId)) {
    return false
  }
  if (!ids && !readPayload(change, 'viewQueryAspects')) {
    return false
  }
  if (!aspects?.length) {
    return true
  }

  const byView = readPayload<Record<string, readonly ViewQueryAspect[]>>(
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

  const change = delta.changes.get('view.calc')
  const payload = readPayload<Record<string, readonly FieldId[] | 'all'>>(
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
