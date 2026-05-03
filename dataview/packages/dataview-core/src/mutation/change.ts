import type {
  FieldId,
  RecordId,
  ViewId,
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import type {
  MutationWrite,
} from '@shared/mutation'
import {
  dataviewMutationSchema,
  type DataviewMutationDelta,
  type DataviewMutationQuery,
} from './schema'

export type DataviewQueryAspect =
  | 'search'
  | 'filter'
  | 'sort'
  | 'group'
  | 'order'

type TouchedIds<TId extends string> = ReadonlySet<TId> | 'all'

export interface DataviewMutationChanges {
  record: {
    setChanged(): boolean
    touchedIds(): TouchedIds<RecordId>
    values: {
      touchedFieldIds(): TouchedIds<FieldId>
    }
  }
  field: {
    touchedIds(): TouchedIds<FieldId>
    valueTouchedIds(): TouchedIds<FieldId>
    schemaTouchedIds(): TouchedIds<FieldId>
    schemaChanged(fieldId?: FieldId): boolean
  }
  view: {
    touchedIds(): TouchedIds<ViewId>
    queryChanged(viewId: ViewId, aspect?: DataviewQueryAspect): boolean
    layoutChanged(viewId: ViewId): boolean
  }
  recordSetChanged(): boolean
  touchedRecords(): TouchedIds<RecordId>
  touchedValueFields(): TouchedIds<FieldId>
  fieldSchemaTouchedIds(): TouchedIds<FieldId>
  touchedFields(): TouchedIds<FieldId>
  fieldSchemaChanged(fieldId?: FieldId): boolean
  viewQueryChanged(viewId: ViewId, aspect?: DataviewQueryAspect): boolean
  viewLayoutChanged(viewId: ViewId): boolean
}

interface DataviewChangeQuery {
  records: {
    ids(): readonly RecordId[]
    has(id: RecordId): boolean
  }
  fields: {
    ids(): readonly FieldId[]
    has(id: FieldId): boolean
  }
  views: {
    has(id: ViewId): boolean
  }
}

const FIELD_SCHEMA_KEYS = [
  'name',
  'kind',
  'displayFullUrl',
  'format',
  'precision',
  'currency',
  'useThousandsSeparator',
  'defaultOptionId',
  'displayDateFormat',
  'displayTimeFormat',
  'defaultValueKind',
  'defaultTimezone',
  'multiple',
  'accept',
  'meta'
] as const

const hasTouchedIds = <TId extends string>(
  ids: TouchedIds<TId>
): boolean => ids === 'all' || ids.size > 0

const collectTouchedIds = <TId extends string>(
  reset: boolean,
  writes: readonly MutationWrite[],
  predicate: (write: MutationWrite) => TId | undefined
): TouchedIds<TId> => {
  if (reset) {
    return 'all'
  }

  const ids = new Set<TId>()
  writes.forEach((write) => {
    const id = predicate(write)
    if (id !== undefined) {
      ids.add(id)
    }
  })
  return ids
}

export const createDataviewChanges = (
  raw: DataviewMutationQuery,
  query: DataviewChangeQuery,
  delta: DataviewMutationDelta
): DataviewMutationChanges => {
  const nodes = dataviewMutationSchema.shape
  const base = raw.changes(delta)
  const reset = base.reset()
  const writes = base.writes()

  const createdRecordIds = collectTouchedIds<RecordId>(
    reset,
    writes,
    (write) => write.kind === 'entity.create' && write.node === nodes.records && typeof write.targetId === 'string'
      ? write.targetId as RecordId
      : undefined
  )

  const removedRecordIds = collectTouchedIds<RecordId>(
    reset,
    writes,
    (write) => write.kind === 'entity.remove' && write.node === nodes.records && typeof write.targetId === 'string'
      ? write.targetId as RecordId
      : undefined
  )

  const recordTitleChanged = (recordId?: RecordId): boolean => (
    recordId === undefined
      ? query.records.ids().some((currentRecordId) => base.records(currentRecordId).title.changed())
      : query.records.has(recordId)
        ? base.records(recordId).title.changed()
        : writes.some((write) => (
            write.node === nodes.records.shape.title
            && write.targetId === recordId
          ))
  )

  const touchedRecords = (): TouchedIds<RecordId> => collectTouchedIds<RecordId>(
    reset,
    writes,
    (write) => {
      if (write.node === nodes.records && typeof write.targetId === 'string') {
        return write.targetId as RecordId
      }
      if (
        typeof write.targetId === 'string'
        && (
          write.node === nodes.records.shape.title
          || write.node === nodes.records.shape.type
          || write.node === nodes.records.shape.values
          || write.node === nodes.records.shape.meta
        )
      ) {
        return write.targetId as RecordId
      }
      return undefined
    }
  )

  const valueTouchedIds = (): TouchedIds<FieldId> => {
    if (reset) {
      return 'all'
    }

    const ids = new Set<FieldId>()
    writes.forEach((write) => {
      if (write.node !== nodes.records.shape.values) {
        return
      }
      if (write.kind === 'dictionary.set' || write.kind === 'dictionary.delete') {
        ids.add(write.key as FieldId)
        return
      }
      if (write.kind === 'dictionary.replace') {
        Object.keys(write.value).forEach((fieldId) => {
          ids.add(fieldId as FieldId)
        })
      }
    })

    if (recordTitleChanged()) {
      ids.add(TITLE_FIELD_ID)
    }

    return ids
  }

  const fieldSchemaChanged = (
    fieldId?: FieldId
  ): boolean => {
    if (fieldId === undefined) {
      const currentFieldIds = query.fields.ids()
      if (currentFieldIds.some((currentFieldId) => fieldSchemaChanged(currentFieldId))) {
        return true
      }

      return writes.some((write) => write.node === nodes.fields)
    }

    if (fieldId === TITLE_FIELD_ID) {
      return recordTitleChanged()
    }
    if (!query.fields.has(fieldId)) {
      return base.fields.created(fieldId) || base.fields.removed(fieldId)
    }

    const field = base.fields(fieldId)
    return base.fields.created(fieldId)
      || base.fields.removed(fieldId)
      || FIELD_SCHEMA_KEYS.some((key) => field[key].changed())
      || field.options.changed()
  }

  const fieldSchemaTouchedIds = (): TouchedIds<FieldId> => {
    if (reset) {
      return 'all'
    }

    const ids = new Set<FieldId>()
    if (fieldSchemaChanged(TITLE_FIELD_ID)) {
      ids.add(TITLE_FIELD_ID)
    }

    query.fields.ids().forEach((fieldId) => {
      if (fieldId !== TITLE_FIELD_ID && fieldSchemaChanged(fieldId)) {
        ids.add(fieldId)
      }
    })

    writes.forEach((write) => {
      if (write.node === nodes.fields && typeof write.targetId === 'string') {
        ids.add(write.targetId as FieldId)
      }
    })

    return ids
  }

  const touchedFields = (): TouchedIds<FieldId> => {
    const valueIds = valueTouchedIds()
    const schemaIds = fieldSchemaTouchedIds()
    if (valueIds === 'all' || schemaIds === 'all') {
      return 'all'
    }

    return new Set<FieldId>([
      ...valueIds,
      ...schemaIds
    ])
  }

  const touchedViews = (): TouchedIds<ViewId> => collectTouchedIds<ViewId>(
    reset,
    writes,
    (write) => {
      if (write.node === nodes.views && typeof write.targetId === 'string') {
        return write.targetId as ViewId
      }
      if (
        typeof write.targetId === 'string'
        && (
          write.node === nodes.views.shape.name
          || write.node === nodes.views.shape.type
          || write.node === nodes.views.shape.search
          || write.node === nodes.views.shape.filter
          || write.node === nodes.views.shape.sort
          || write.node === nodes.views.shape.group
          || write.node === nodes.views.shape.calc
          || write.node === nodes.views.shape.options
          || write.node === nodes.views.shape.fields
          || write.node === nodes.views.shape.order
        )
      ) {
        return write.targetId as ViewId
      }
      return undefined
    }
  )

  const viewQueryChanged = (
    viewId: ViewId,
    aspect?: DataviewQueryAspect
  ): boolean => {
    if (!query.views.has(viewId)) {
      return base.views.created(viewId) || base.views.removed(viewId)
    }

    const view = base.views(viewId)
    if (aspect === undefined) {
      return view.search.changed()
        || view.filter.changed()
        || view.sort.changed()
        || view.group.changed()
        || view.order.changed()
    }

    switch (aspect) {
      case 'search':
        return view.search.changed()
      case 'filter':
        return view.filter.changed()
      case 'sort':
        return view.sort.changed()
      case 'group':
        return view.group.changed()
      case 'order':
        return view.order.changed()
    }
  }

  const viewLayoutChanged = (
    viewId: ViewId
  ): boolean => {
    if (!query.views.has(viewId)) {
      return base.views.created(viewId) || base.views.removed(viewId)
    }

    const view = base.views(viewId)
    return view.name.changed()
      || view.type.changed()
      || view.fields.changed()
      || view.options.changed()
  }

  const recordSetChanged = (): boolean => (
    reset
    || hasTouchedIds(createdRecordIds)
    || hasTouchedIds(removedRecordIds)
  )

  return {
    record: {
      setChanged: recordSetChanged,
      touchedIds: touchedRecords,
      values: {
        touchedFieldIds: valueTouchedIds
      }
    },
    field: {
      touchedIds: touchedFields,
      valueTouchedIds,
      schemaTouchedIds: fieldSchemaTouchedIds,
      schemaChanged: fieldSchemaChanged
    },
    view: {
      touchedIds: touchedViews,
      queryChanged: viewQueryChanged,
      layoutChanged: viewLayoutChanged
    },
    recordSetChanged,
    touchedRecords,
    touchedValueFields: valueTouchedIds,
    fieldSchemaTouchedIds,
    touchedFields,
    fieldSchemaChanged,
    viewQueryChanged,
    viewLayoutChanged,
  }
}
