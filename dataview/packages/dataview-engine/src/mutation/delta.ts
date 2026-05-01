import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'
import type {
  TraceDeltaSummary
} from '@dataview/engine/contracts/performance'
import {
  normalizeMutationDelta,
  type MutationDelta,
  type MutationDeltaInput,
} from '@shared/mutation'

export type DataviewQueryAspect =
  | 'search'
  | 'filter'
  | 'sort'
  | 'group'
  | 'order'

export type DataviewMutationDelta = MutationDelta & {
  raw: MutationDelta
  document: {
    activeViewChanged(): boolean
  }
  record: {
    create: {
      touchedIds(): ReadonlySet<RecordId> | 'all'
      changed(recordId?: RecordId): boolean
    }
    title: {
      touchedIds(): ReadonlySet<RecordId> | 'all'
      changed(recordId?: RecordId): boolean
    }
    type: {
      touchedIds(): ReadonlySet<RecordId> | 'all'
      changed(recordId?: RecordId): boolean
    }
    meta: {
      touchedIds(): ReadonlySet<RecordId> | 'all'
      changed(recordId?: RecordId): boolean
    }
    delete: {
      touchedIds(): ReadonlySet<RecordId> | 'all'
      changed(recordId?: RecordId): boolean
    }
    touchedIds(): ReadonlySet<RecordId> | 'all'
    values: {
      touchedRecordIds(): ReadonlySet<RecordId> | 'all'
      touchedFieldIds(): ReadonlySet<FieldId> | 'all'
      changed(recordId?: RecordId, fieldId?: FieldId): boolean
    }
  }
  field: {
    create: {
      touchedIds(): ReadonlySet<FieldId> | 'all'
    }
    delete: {
      touchedIds(): ReadonlySet<FieldId> | 'all'
    }
    meta: {
      touchedIds(): ReadonlySet<FieldId> | 'all'
    }
    schema: {
      touchedIds(): ReadonlySet<FieldId> | 'all'
      changed(fieldId?: FieldId): boolean
    }
    touchedIds(): ReadonlySet<FieldId> | 'all'
  }
  view: {
    touchedIds(): ReadonlySet<ViewId> | 'all'
    layout(viewId: ViewId): {
      changed(): boolean
    }
    query(viewId: ViewId): {
      changed(aspect?: DataviewQueryAspect): boolean
    }
    calc(viewId: ViewId): {
      changed(): boolean
    }
  }
  touched: {
    records(): ReadonlySet<RecordId> | 'all'
    fields(): ReadonlySet<FieldId> | 'all'
    views(): ReadonlySet<ViewId> | 'all'
  }
  recordSetChanged(): boolean
  summary(): TraceDeltaSummary
}

const RECORD_TOUCH_KEYS = [
  'record.create',
  'record.title',
  'record.type',
  'record.meta',
  'record.delete',
  'record.values'
] as const

const FIELD_TOUCH_KEYS = [
  'field.create',
  'field.delete',
  'field.schema',
  'field.meta'
] as const

const VIEW_TOUCH_KEYS = [
  'view.create',
  'view.query',
  'view.layout',
  'view.calc',
  'view.delete'
] as const

const DATAVIEW_DELTA_CACHE = new WeakMap<MutationDelta, DataviewMutationDelta>()

const countTouched = <T,>(
  value: ReadonlySet<T> | 'all'
): number | 'all' => value === 'all'
  ? 'all'
  : value.size

const countIds = (
  ids: ReadonlySet<string> | 'all'
): number | 'all' => ids === 'all'
  ? 'all'
  : ids.size

const readChangedPaths = (
  delta: MutationDelta,
  key: string,
  id: string
): readonly string[] | 'all' | undefined => delta.reset === true
  ? 'all'
  : delta.paths(key, id)

const changedKey = (
  delta: MutationDelta,
  key: string,
  id?: string
): boolean => delta.reset === true || delta.changed(key, id)

const hasKey = (
  delta: MutationDelta,
  key: string
): boolean => delta.reset === true || delta.has(key)

const readTouchedIds = <TId extends string>(
  delta: MutationDelta,
  keys: readonly string[]
): ReadonlySet<TId> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  let result: Set<TId> | undefined
  for (let index = 0; index < keys.length; index += 1) {
    const ids = delta.ids(keys[index]!)
    if (ids === 'all') {
      return 'all'
    }
    if (ids.size === 0) {
      continue
    }
    if (!result) {
      result = new Set<TId>()
    }
    ids.forEach((id) => {
      result!.add(id as TId)
    })
  }

  return result ?? new Set<TId>()
}

const readTouchedValueFields = (
  delta: MutationDelta
): ReadonlySet<FieldId> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  const changes = delta.changes['record.values']?.paths
  if (changes === 'all') {
    return 'all'
  }

  const fields = new Set<FieldId>()
  Object.values(changes ?? {}).forEach((value) => {
    if (value === 'all') {
      return
    }

    value.forEach((fieldId) => {
      fields.add(fieldId as FieldId)
    })
  })
  return fields
}

const unionTouchedFields = (
  delta: MutationDelta
): ReadonlySet<FieldId> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  const direct = readTouchedIds<FieldId>(delta, FIELD_TOUCH_KEYS)
  const valueFields = readTouchedValueFields(delta)
  if (direct === 'all' || valueFields === 'all') {
    return 'all'
  }

  const result = new Set<FieldId>()
  direct.forEach((fieldId) => {
    result.add(fieldId)
  })
  valueFields.forEach((fieldId) => {
    result.add(fieldId)
  })
  if (delta.has('record.title')) {
    result.add('title')
  }
  return result
}

const countPathIds = (
  delta: MutationDelta,
  key: string
): number | 'all' | undefined => {
  if (delta.reset === true) {
    return 'all'
  }

  const paths = delta.changes[key]?.paths
  if (paths === 'all') {
    return 'all'
  }

  return paths
    ? Object.keys(paths).length
    : undefined
}

const createTouchedIdView = <TId extends string>(
  read: () => ReadonlySet<TId> | 'all',
  changed: (id?: TId) => boolean
) => ({
  touchedIds: read,
  changed
})

const matchViewQueryAspect = (
  delta: MutationDelta,
  viewId: ViewId,
  aspect: DataviewQueryAspect
): boolean => {
  const paths = readChangedPaths(delta, 'view.query', viewId)
  if (paths === 'all') {
    return true
  }

  return (paths ?? []).some((path) => (
    path === aspect
    || (aspect === 'order' && path === 'orders')
    || path.startsWith(`${aspect}.`)
  ))
}

export const createDataviewMutationDelta = (
  raw: MutationDelta | MutationDeltaInput
): DataviewMutationDelta => {
  const normalized = normalizeMutationDelta(raw)
  const cached = DATAVIEW_DELTA_CACHE.get(normalized)
  if (cached) {
    return cached
  }

  const readRecordTouchedIds = () => (
    readTouchedIds<RecordId>(normalized, RECORD_TOUCH_KEYS)
  )
  const readFieldTouchedIds = () => unionTouchedFields(normalized)
  const readViewTouchedIds = () => (
    readTouchedIds<ViewId>(normalized, VIEW_TOUCH_KEYS)
  )
  const readSchemaFieldIds = () => (
    readTouchedIds<FieldId>(normalized, ['field.schema'])
  )

  const delta = Object.assign({}, normalized, {
    raw: normalized,
    document: {
      activeViewChanged: () => hasKey(normalized, 'document.activeViewId')
    },
    record: {
      create: createTouchedIdView<RecordId>(
        () => readTouchedIds<RecordId>(normalized, ['record.create']),
        (recordId) => changedKey(normalized, 'record.create', recordId)
      ),
      title: createTouchedIdView<RecordId>(
        () => readTouchedIds<RecordId>(normalized, ['record.title']),
        (recordId) => changedKey(normalized, 'record.title', recordId)
      ),
      type: createTouchedIdView<RecordId>(
        () => readTouchedIds<RecordId>(normalized, ['record.type']),
        (recordId) => changedKey(normalized, 'record.type', recordId)
      ),
      meta: createTouchedIdView<RecordId>(
        () => readTouchedIds<RecordId>(normalized, ['record.meta']),
        (recordId) => changedKey(normalized, 'record.meta', recordId)
      ),
      delete: createTouchedIdView<RecordId>(
        () => readTouchedIds<RecordId>(normalized, ['record.delete']),
        (recordId) => changedKey(normalized, 'record.delete', recordId)
      ),
      touchedIds: readRecordTouchedIds,
      values: {
        touchedRecordIds: () => readTouchedIds<RecordId>(normalized, ['record.values']),
        touchedFieldIds: () => readTouchedValueFields(normalized),
        changed: (recordId?: RecordId, fieldId?: FieldId) => {
          if (recordId === undefined) {
            return hasKey(normalized, 'record.values')
          }
          if (fieldId === undefined) {
            return changedKey(normalized, 'record.values', recordId)
          }
          const paths = readChangedPaths(normalized, 'record.values', recordId)
          return paths === 'all' || (paths ?? []).includes(fieldId)
        }
      }
    },
    field: {
      create: {
        touchedIds: () => readTouchedIds<FieldId>(normalized, ['field.create'])
      },
      delete: {
        touchedIds: () => readTouchedIds<FieldId>(normalized, ['field.delete'])
      },
      meta: {
        touchedIds: () => readTouchedIds<FieldId>(normalized, ['field.meta'])
      },
      schema: {
        touchedIds: readSchemaFieldIds,
        changed: (fieldId?: FieldId) => fieldId === undefined
          ? hasKey(normalized, 'field.schema')
          : changedKey(normalized, 'field.schema', fieldId)
      },
      touchedIds: readFieldTouchedIds
    },
    view: {
      touchedIds: readViewTouchedIds,
      layout: (viewId: ViewId) => ({
        changed: () => changedKey(normalized, 'view.layout', viewId)
      }),
      query: (viewId: ViewId) => ({
        changed: (aspect?: DataviewQueryAspect) => aspect === undefined
          ? changedKey(normalized, 'view.query', viewId)
          : matchViewQueryAspect(normalized, viewId, aspect)
      }),
      calc: (viewId: ViewId) => ({
        changed: () => changedKey(normalized, 'view.calc', viewId)
      })
    },
    touched: {
      records: readRecordTouchedIds,
      fields: readFieldTouchedIds,
      views: readViewTouchedIds
    },
    recordSetChanged: () => hasKey(normalized, 'record.create') || hasKey(normalized, 'record.delete'),
    summary: (): TraceDeltaSummary => {
      const facts: Array<{
        kind: string
        count?: number
      }> = []
      const pushFact = (
        kind: string,
        count: number | 'all' | undefined
      ) => {
        if (count === undefined) {
          return
        }

        facts.push({
          kind,
          ...(typeof count === 'number'
            ? { count }
            : {})
        })
      }

      pushFact('record.insert', countIds(normalized.ids('record.create') as ReadonlySet<string> | 'all'))
      pushFact('record.title', countIds(normalized.ids('record.title') as ReadonlySet<string> | 'all'))
      pushFact('record.type', countIds(normalized.ids('record.type') as ReadonlySet<string> | 'all'))
      pushFact('record.meta', countIds(normalized.ids('record.meta') as ReadonlySet<string> | 'all'))
      pushFact('record.remove', countIds(normalized.ids('record.delete') as ReadonlySet<string> | 'all'))
      pushFact('record.value', countPathIds(normalized, 'record.values'))
      pushFact('field.insert', countIds(normalized.ids('field.create') as ReadonlySet<string> | 'all'))
      pushFact('field.remove', countIds(normalized.ids('field.delete') as ReadonlySet<string> | 'all'))
      pushFact('field.schema', countIds(normalized.ids('field.schema') as ReadonlySet<string> | 'all'))
      pushFact('field.meta', countIds(normalized.ids('field.meta') as ReadonlySet<string> | 'all'))
      pushFact('view.insert', countIds(normalized.ids('view.create') as ReadonlySet<string> | 'all'))
      pushFact('view.change', countIds(normalized.ids('view.query') as ReadonlySet<string> | 'all'))
      pushFact('view.layout', countIds(normalized.ids('view.layout') as ReadonlySet<string> | 'all'))
      pushFact('view.calc', countIds(normalized.ids('view.calc') as ReadonlySet<string> | 'all'))
      pushFact('view.remove', countIds(normalized.ids('view.delete') as ReadonlySet<string> | 'all'))
      pushFact('activeView.set', normalized.changes['document.activeViewId'] ? 1 : undefined)
      pushFact('external.version', normalized.changes['external.version'] ? 1 : undefined)
      pushFact('reset', normalized.reset === true ? 1 : undefined)

      return {
        summary: {
          records: RECORD_TOUCH_KEYS.some((key) => hasKey(normalized, key)),
          fields: FIELD_TOUCH_KEYS.some((key) => hasKey(normalized, key)),
          views: VIEW_TOUCH_KEYS.some((key) => hasKey(normalized, key)),
          activeView: hasKey(normalized, 'document.activeViewId'),
          external: hasKey(normalized, 'external.version'),
          indexes: [
            ...RECORD_TOUCH_KEYS,
            ...FIELD_TOUCH_KEYS,
            'view.query',
            'view.calc'
          ].some((key) => hasKey(normalized, key))
        },
        facts,
        entities: {
          touchedRecordCount: countTouched(readRecordTouchedIds()),
          touchedFieldCount: countTouched(readFieldTouchedIds()),
          touchedViewCount: countTouched(readViewTouchedIds())
        }
      }
    }
  }) as DataviewMutationDelta

  DATAVIEW_DELTA_CACHE.set(normalized, delta)
  return delta
}
