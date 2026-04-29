import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'
import type {
  TraceDeltaSummary
} from '@dataview/engine/contracts/performance'
import {
  collectMutationTouchedIds,
  createTypedMutationDelta,
  defineMutationSchema,
  type MutationDelta,
  type MutationDeltaInput,
  type MutationPathCodec,
  type TypedMutationDeltaContext
} from '@shared/mutation'

export type DataviewQueryAspect =
  | 'search'
  | 'filter'
  | 'sort'
  | 'group'
  | 'order'

type DataviewViewQueryPath = {
  aspect: DataviewQueryAspect
  raw: string
}

type DataviewMutationSchema = typeof dataviewMutationSchema

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

const VALUE_PATH_CODEC: MutationPathCodec<FieldId> = {
  parse: (path) => {
    if (!path) {
      return undefined
    }

    return path as FieldId
  },
  format: (path) => path
}

const VIEW_QUERY_PATH_CODEC: MutationPathCodec<DataviewViewQueryPath> = {
  parse: (path) => {
    const [head] = path.split('.')
    switch (head) {
      case 'search':
      case 'filter':
      case 'sort':
      case 'group':
        return {
          aspect: head,
          raw: path
        }
      case 'orders':
        return {
          aspect: 'order',
          raw: path
        }
      default:
        return undefined
    }
  },
  format: (path) => path.raw
}

const dataviewMutationSchema = defineMutationSchema({
  'record.create': {
    ids: true
  },
  'record.title': {
    ids: true
  },
  'record.type': {
    ids: true
  },
  'record.meta': {
    ids: true
  },
  'record.delete': {
    ids: true
  },
  'record.values': {
    ids: true,
    paths: VALUE_PATH_CODEC
  },
  'field.create': {
    ids: true
  },
  'field.delete': {
    ids: true
  },
  'field.schema': {
    ids: true
  },
  'field.meta': {
    ids: true
  },
  'view.create': {
    ids: true
  },
  'view.query': {
    ids: true,
    paths: VIEW_QUERY_PATH_CODEC
  },
  'view.layout': {
    ids: true
  },
  'view.calc': {
    ids: true
  },
  'view.delete': {
    ids: true
  },
  'document.activeViewId': {},
  'external.version': {}
} as const)

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

const countTouched = <T,>(
  value: ReadonlySet<T> | 'all'
): number | 'all' => value === 'all'
  ? 'all'
  : value.size

const countIds = (
  ids: readonly string[] | 'all' | undefined
): number | 'all' | undefined => ids === 'all'
  ? 'all'
  : ids?.length

const countPathIds = (
  context: TypedMutationDeltaContext<DataviewMutationSchema>,
  key: keyof DataviewMutationSchema & string
): number | 'all' | undefined => {
  const paths = context.paths(key)
  if (paths === 'all') {
    return 'all'
  }

  return paths
    ? Object.keys(paths).length
    : undefined
}

const unionTouchedFields = (
  context: TypedMutationDeltaContext<DataviewMutationSchema>
): ReadonlySet<FieldId> | 'all' => {
  if (context.raw.reset === true) {
    return 'all'
  }

  const direct = collectMutationTouchedIds<FieldId>(context.raw, FIELD_TOUCH_KEYS)
  const valueFields = readTouchedValueFields(context)
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
  if (context.has('record.title')) {
    result.add('title')
  }
  return result
}

const readTouchedValueFields = (
  context: TypedMutationDeltaContext<DataviewMutationSchema>
): ReadonlySet<FieldId> | 'all' => {
  if (context.raw.reset === true) {
    return 'all'
  }

  const paths = context.paths('record.values')
  if (paths === 'all') {
    return 'all'
  }

  const fields = new Set<FieldId>()
  Object.values(paths ?? {}).forEach((value) => {
    if (value === 'all') {
      return
    }

    value.forEach((fieldId) => {
      fields.add(fieldId as FieldId)
    })
  })
  return fields
}

const createTouchedIdView = <TId extends string>(
  read: () => ReadonlySet<TId> | 'all',
  changed: (id?: TId) => boolean
) => ({
  touchedIds: read,
  changed
})

const DATAVIEW_DELTA_CACHE = new WeakMap<MutationDelta, DataviewMutationDelta>()

export const createDataviewMutationDelta = (
  raw: MutationDelta | MutationDeltaInput
): DataviewMutationDelta => {
  const cached = raw && typeof raw === 'object'
    ? DATAVIEW_DELTA_CACHE.get(raw as MutationDelta)
    : undefined
  if (cached) {
    return cached
  }

  const delta = createTypedMutationDelta({
    raw,
    schema: dataviewMutationSchema,
    build: (context) => {
      const readRecordTouchedIds = () => (
        context.touchedIds(RECORD_TOUCH_KEYS) as ReadonlySet<RecordId> | 'all'
      )
      const readFieldTouchedIds = () => unionTouchedFields(context)
      const readViewTouchedIds = () => (
        context.touchedIds(VIEW_TOUCH_KEYS) as ReadonlySet<ViewId> | 'all'
      )
      const readSchemaFieldIds = () => (
        context.touchedIds(['field.schema']) as ReadonlySet<FieldId> | 'all'
      )

      return {
        document: {
          activeViewChanged: () => context.has('document.activeViewId')
        },
        record: {
          create: createTouchedIdView<RecordId>(
            () => context.touchedIds(['record.create']) as ReadonlySet<RecordId> | 'all',
            (recordId) => context.changed('record.create', recordId)
          ),
          title: createTouchedIdView<RecordId>(
            () => context.touchedIds(['record.title']) as ReadonlySet<RecordId> | 'all',
            (recordId) => context.changed('record.title', recordId)
          ),
          type: createTouchedIdView<RecordId>(
            () => context.touchedIds(['record.type']) as ReadonlySet<RecordId> | 'all',
            (recordId) => context.changed('record.type', recordId)
          ),
          meta: createTouchedIdView<RecordId>(
            () => context.touchedIds(['record.meta']) as ReadonlySet<RecordId> | 'all',
            (recordId) => context.changed('record.meta', recordId)
          ),
          delete: createTouchedIdView<RecordId>(
            () => context.touchedIds(['record.delete']) as ReadonlySet<RecordId> | 'all',
            (recordId) => context.changed('record.delete', recordId)
          ),
          touchedIds: readRecordTouchedIds,
          values: {
            touchedRecordIds: () => context.touchedIds(['record.values']) as ReadonlySet<RecordId> | 'all',
            touchedFieldIds: () => readTouchedValueFields(context),
            changed: (recordId, fieldId) => {
              if (recordId === undefined) {
                return context.has('record.values')
              }
              if (fieldId === undefined) {
                return context.changed('record.values', recordId)
              }
              return context.matches('record.values', recordId, path => path === fieldId)
            }
          }
        },
        field: {
          create: {
            touchedIds: () => context.touchedIds(['field.create']) as ReadonlySet<FieldId> | 'all'
          },
          delete: {
            touchedIds: () => context.touchedIds(['field.delete']) as ReadonlySet<FieldId> | 'all'
          },
          meta: {
            touchedIds: () => context.touchedIds(['field.meta']) as ReadonlySet<FieldId> | 'all'
          },
          schema: {
            touchedIds: readSchemaFieldIds,
            changed: (fieldId) => fieldId === undefined
              ? context.has('field.schema')
              : context.changed('field.schema', fieldId)
          },
          touchedIds: readFieldTouchedIds
        },
        view: {
          touchedIds: readViewTouchedIds,
          layout: (viewId: ViewId) => ({
            changed: () => context.changed('view.layout', viewId)
          }),
          query: (viewId: ViewId) => ({
            changed: (aspect?: DataviewQueryAspect) => aspect === undefined
              ? context.changed('view.query', viewId)
              : context.matches('view.query', viewId, path => path.aspect === aspect)
          }),
          calc: (viewId: ViewId) => ({
            changed: () => context.changed('view.calc', viewId)
          })
        },
        touched: {
          records: readRecordTouchedIds,
          fields: readFieldTouchedIds,
          views: readViewTouchedIds
        },
        recordSetChanged: () => context.any(['record.create', 'record.delete']),
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

          pushFact('record.insert', countIds(context.ids('record.create')))
          pushFact('record.title', countIds(context.ids('record.title')))
          pushFact('record.type', countIds(context.ids('record.type')))
          pushFact('record.meta', countIds(context.ids('record.meta')))
          pushFact('record.remove', countIds(context.ids('record.delete')))
          pushFact('record.value', countPathIds(context, 'record.values'))
          pushFact('field.insert', countIds(context.ids('field.create')))
          pushFact('field.remove', countIds(context.ids('field.delete')))
          pushFact('field.schema', countIds(context.ids('field.schema')))
          pushFact('field.meta', countIds(context.ids('field.meta')))
          pushFact('view.insert', countIds(context.ids('view.create')))
          pushFact('view.change', countIds(context.ids('view.query')))
          pushFact('view.layout', countIds(context.ids('view.layout')))
          pushFact('view.calc', countIds(context.ids('view.calc')))
          pushFact('view.remove', countIds(context.ids('view.delete')))
          pushFact('activeView.set', context.raw.changes.get('document.activeViewId') ? 1 : undefined)
          pushFact('external.version', context.raw.changes.get('external.version') ? 1 : undefined)
          pushFact('reset', context.raw.reset === true ? 1 : undefined)

          return {
            summary: {
              records: context.any(RECORD_TOUCH_KEYS),
              fields: context.any(FIELD_TOUCH_KEYS),
              views: context.any(VIEW_TOUCH_KEYS),
              activeView: context.has('document.activeViewId'),
              external: context.has('external.version'),
              indexes: context.any([
                ...RECORD_TOUCH_KEYS,
                ...FIELD_TOUCH_KEYS,
                'view.query',
                'view.calc'
              ])
            },
            facts,
            entities: {
              touchedRecordCount: countTouched(readRecordTouchedIds()),
              touchedFieldCount: countTouched(readFieldTouchedIds()),
              touchedViewCount: countTouched(readViewTouchedIds())
            }
          }
        }
      }
    }
  }) as DataviewMutationDelta

  if (raw && typeof raw === 'object') {
    DATAVIEW_DELTA_CACHE.set(raw as MutationDelta, delta)
  }
  return delta
}
