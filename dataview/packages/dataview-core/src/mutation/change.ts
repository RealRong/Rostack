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
  const createdFieldIds = collectTouchedIds<FieldId>(
    reset,
    writes,
    (write) => write.kind === 'entity.create' && write.node === nodes.fields && typeof write.targetId === 'string'
      ? write.targetId as FieldId
      : undefined
  )
  const removedFieldIds = collectTouchedIds<FieldId>(
    reset,
    writes,
    (write) => write.kind === 'entity.remove' && write.node === nodes.fields && typeof write.targetId === 'string'
      ? write.targetId as FieldId
      : undefined
  )
  const createdViewIds = collectTouchedIds<ViewId>(
    reset,
    writes,
    (write) => write.kind === 'entity.create' && write.node === nodes.views && typeof write.targetId === 'string'
      ? write.targetId as ViewId
      : undefined
  )
  const removedViewIds = collectTouchedIds<ViewId>(
    reset,
    writes,
    (write) => write.kind === 'entity.remove' && write.node === nodes.views && typeof write.targetId === 'string'
      ? write.targetId as ViewId
      : undefined
  )

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

  const hasTouchedId = <TId extends string>(
    ids: TouchedIds<TId>,
    id: TId
  ): boolean => ids === 'all' || ids.has(id)

  let recordTitleTouched = false
  const recordTitleIds = new Set<RecordId>()
  const valueFieldIds = new Set<FieldId>()
  const fieldSchemaIds = new Set<FieldId>()
  const touchedViewIds = new Set<ViewId>()
  const viewQueryChanges = new Map<ViewId, Set<DataviewQueryAspect>>()
  const viewLayoutChanges = new Set<ViewId>()

  writes.forEach((write) => {
    if (write.node === nodes.records.shape.title) {
      recordTitleTouched = true
      if (typeof write.targetId === 'string') {
        recordTitleIds.add(write.targetId as RecordId)
      }
      return
    }

    if (write.node === nodes.records.shape.values) {
      if (write.kind === 'dictionary.set' || write.kind === 'dictionary.delete') {
        valueFieldIds.add(write.key as FieldId)
        return
      }

      if (write.kind === 'dictionary.replace') {
        Object.keys(write.value).forEach((fieldId) => {
          valueFieldIds.add(fieldId as FieldId)
        })
      }
      return
    }

    if (
      typeof write.targetId === 'string'
      && (
        write.node === nodes.fields.shape.name
        || write.node === nodes.fields.shape.kind
        || write.node === nodes.fields.shape.displayFullUrl
        || write.node === nodes.fields.shape.format
        || write.node === nodes.fields.shape.precision
        || write.node === nodes.fields.shape.currency
        || write.node === nodes.fields.shape.useThousandsSeparator
        || write.node === nodes.fields.shape.defaultOptionId
        || write.node === nodes.fields.shape.displayDateFormat
        || write.node === nodes.fields.shape.displayTimeFormat
        || write.node === nodes.fields.shape.defaultValueKind
        || write.node === nodes.fields.shape.defaultTimezone
        || write.node === nodes.fields.shape.multiple
        || write.node === nodes.fields.shape.accept
        || write.node === nodes.fields.shape.meta
        || write.node === nodes.fields.shape.options
      )
    ) {
      fieldSchemaIds.add(write.targetId as FieldId)
      return
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
      const viewId = write.targetId as ViewId
      touchedViewIds.add(viewId)

      if (
        write.node === nodes.views.shape.name
        || write.node === nodes.views.shape.type
        || write.node === nodes.views.shape.options
        || write.node === nodes.views.shape.fields
      ) {
        viewLayoutChanges.add(viewId)
      }

      const aspects = viewQueryChanges.get(viewId) ?? new Set<DataviewQueryAspect>()
      if (write.node === nodes.views.shape.search) {
        aspects.add('search')
      } else if (write.node === nodes.views.shape.filter) {
        aspects.add('filter')
      } else if (write.node === nodes.views.shape.sort) {
        aspects.add('sort')
      } else if (write.node === nodes.views.shape.group) {
        aspects.add('group')
      } else if (write.node === nodes.views.shape.order) {
        aspects.add('order')
      }
      viewQueryChanges.set(viewId, aspects)
    }
  })

  const recordTitleChanged = (recordId?: RecordId): boolean => recordId === undefined
    ? recordTitleTouched
    : recordTitleIds.has(recordId)

  let touchedRecordsCache: TouchedIds<RecordId> | undefined
  let valueTouchedIdsCache: TouchedIds<FieldId> | undefined
  let fieldSchemaTouchedIdsCache: TouchedIds<FieldId> | undefined
  let touchedFieldsCache: TouchedIds<FieldId> | undefined
  let touchedViewsCache: TouchedIds<ViewId> | undefined

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
    if (valueTouchedIdsCache) {
      return valueTouchedIdsCache
    }

    if (reset) {
      valueTouchedIdsCache = 'all'
      return valueTouchedIdsCache
    }

    const ids = new Set<FieldId>()
    valueFieldIds.forEach((fieldId) => {
      ids.add(fieldId)
    })

    if (recordTitleTouched) {
      ids.add(TITLE_FIELD_ID)
    }

    valueTouchedIdsCache = ids
    return valueTouchedIdsCache
  }

  const fieldSchemaChanged = (
    fieldId?: FieldId
  ): boolean => {
    if (fieldId === undefined) {
      const touched = fieldSchemaTouchedIds()
      return touched === 'all' || touched.size > 0
    }

    if (fieldId === TITLE_FIELD_ID) {
      return recordTitleChanged()
    }
    return hasTouchedId(createdFieldIds, fieldId)
      || hasTouchedId(removedFieldIds, fieldId)
      || fieldSchemaIds.has(fieldId)
  }

  const fieldSchemaTouchedIds = (): TouchedIds<FieldId> => {
    if (fieldSchemaTouchedIdsCache) {
      return fieldSchemaTouchedIdsCache
    }

    if (reset) {
      fieldSchemaTouchedIdsCache = 'all'
      return fieldSchemaTouchedIdsCache
    }

    const ids = new Set<FieldId>()
    if (recordTitleTouched) {
      ids.add(TITLE_FIELD_ID)
    }

    fieldSchemaIds.forEach((fieldId) => {
      ids.add(fieldId)
    })

    if (createdFieldIds !== 'all') {
      createdFieldIds.forEach((fieldId) => {
        ids.add(fieldId)
      })
    }

    if (removedFieldIds !== 'all') {
      removedFieldIds.forEach((fieldId) => {
        ids.add(fieldId)
      })
    }

    fieldSchemaTouchedIdsCache = ids
    return fieldSchemaTouchedIdsCache
  }

  const touchedFields = (): TouchedIds<FieldId> => {
    if (touchedFieldsCache) {
      return touchedFieldsCache
    }

    const valueIds = valueTouchedIds()
    const schemaIds = fieldSchemaTouchedIds()
    if (valueIds === 'all' || schemaIds === 'all') {
      touchedFieldsCache = 'all'
      return touchedFieldsCache
    }

    touchedFieldsCache = new Set<FieldId>([
      ...valueIds,
      ...schemaIds
    ])
    return touchedFieldsCache
  }

  const touchedViews = (): TouchedIds<ViewId> => {
    if (touchedViewsCache) {
      return touchedViewsCache
    }

    if (reset) {
      touchedViewsCache = 'all'
      return touchedViewsCache
    }

    const ids = new Set<ViewId>()
    touchedViewIds.forEach((viewId) => {
      ids.add(viewId)
    })
    if (createdViewIds !== 'all') {
      createdViewIds.forEach((viewId) => {
        ids.add(viewId)
      })
    }
    if (removedViewIds !== 'all') {
      removedViewIds.forEach((viewId) => {
        ids.add(viewId)
      })
    }
    touchedViewsCache = ids
    return touchedViewsCache
  }

  const viewQueryChanged = (
    viewId: ViewId,
    aspect?: DataviewQueryAspect
  ): boolean => {
    if (!query.views.has(viewId)) {
      return hasTouchedId(createdViewIds, viewId) || hasTouchedId(removedViewIds, viewId)
    }

    if (aspect === undefined) {
      return viewQueryChanges.get(viewId)?.size !== undefined
        && viewQueryChanges.get(viewId)!.size > 0
    }

    return viewQueryChanges.get(viewId)?.has(aspect) === true
  }

  const viewLayoutChanged = (
    viewId: ViewId
  ): boolean => {
    if (!query.views.has(viewId)) {
      return hasTouchedId(createdViewIds, viewId) || hasTouchedId(removedViewIds, viewId)
    }

    return viewLayoutChanges.has(viewId)
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
