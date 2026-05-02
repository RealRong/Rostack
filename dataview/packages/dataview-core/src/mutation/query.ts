import type {
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId,
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  createMutationReader
} from '@shared/mutation'
import {
  documentValues
} from '@dataview/core/document/values'
import {
  documentViews
} from '@dataview/core/document/views'
import {
  normalizeRecordOrderIds
} from '@dataview/core/view/order'
import {
  dataviewMutationModel,
  dataviewTitleField,
  type DataviewMutationDelta,
  type DataviewMutationReader,
} from './model'

type RecordIdSource = readonly RecordId[] | ReadonlySet<RecordId>

const toRecordIdSet = (
  validIds: RecordIdSource | undefined,
  fallback: () => readonly RecordId[]
): ReadonlySet<RecordId> => {
  if (validIds instanceof Set) {
    return validIds
  }

  return new Set(validIds ?? fallback())
}

const FIELD_SCHEMA_KEYS = [
  'name',
  'kind',
  'system',
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
  'options'
] as const

type FieldSchemaKey = (typeof FIELD_SCHEMA_KEYS)[number]

const unionTouched = <T extends string>(
  values: readonly (ReadonlySet<T> | 'all')[]
): ReadonlySet<T> | 'all' => {
  const result = new Set<T>()

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!
    if (value === 'all') {
      return 'all'
    }

    value.forEach((entry) => {
      result.add(entry)
    })
  }

  return result
}

const readChangedPathKeys = <TKey extends string>(
  delta: DataviewMutationDelta,
  changeKey: string,
  base: string
): ReadonlySet<TKey> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  const paths = delta.changes[changeKey]?.paths
  if (paths === 'all') {
    return 'all'
  }

  const keys = new Set<TKey>()
  for (const value of Object.values(paths ?? {})) {
    if (value === 'all') {
      return 'all'
    }

    value.forEach((path) => {
      if (!path.startsWith(`${base}.`)) {
        return
      }

      const suffix = path.slice(base.length + 1)
      const nextKey = suffix.split('.')[0]
      if (nextKey) {
        keys.add(nextKey as TKey)
      }
    })
  }

  return keys
}

const emptyRecord = Object.freeze({}) as Readonly<Record<string, unknown>>

export interface DataviewDeltaQuery {
  raw: DataviewMutationDelta
  recordSetChanged(): boolean
  touchedRecords(): ReadonlySet<RecordId> | 'all'
  touchedViews(): ReadonlySet<ViewId> | 'all'
  touchedValueFields(): ReadonlySet<FieldId> | 'all'
  touchedFields(): ReadonlySet<FieldId> | 'all'
  fieldSchemaTouchedIds(): ReadonlySet<FieldId> | 'all'
  fieldSchemaChanged(fieldId?: FieldId): boolean
  viewQueryChanged(
    viewId: ViewId,
    aspect?: 'search' | 'filter' | 'sort' | 'group' | 'order'
  ): boolean
  viewLayoutChanged(viewId: ViewId): boolean
}

export interface DataviewQuery {
  model: typeof dataviewMutationModel
  reader: DataviewMutationReader
  document(): DataDoc
  records: {
    ids(): readonly RecordId[]
    list(): readonly DataRecord[]
    get(id: RecordId): DataRecord | undefined
    has(id: RecordId): boolean
    normalize(recordIds: readonly RecordId[] | undefined, validIds?: RecordIdSource): RecordId[]
  }
  values: {
    get(recordId: RecordId, fieldId: FieldId): unknown | undefined
  }
  fields: {
    ids(): readonly FieldId[]
    list(): readonly Field[]
    get(id: FieldId): Field | undefined
    has(id: FieldId): boolean
    known(id: FieldId): boolean
  }
  views: {
    ids(): readonly ViewId[]
    list(): readonly View[]
    get(id: ViewId): View | undefined
    has(id: ViewId): boolean
    activeId(): ViewId | undefined
    active(): View | undefined
  }
  changes(delta: DataviewMutationDelta): DataviewDeltaQuery
}

export interface DataviewQueryContext {
  document: DataDoc
  reader: DataviewMutationReader
  query: DataviewQuery
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
  fieldsById: ReadonlyMap<FieldId, Field>
  activeViewId?: ViewId
  activeView?: View
}

export const createDataviewQuery = (
  reader: DataviewMutationReader
): DataviewQuery => {
  const readDocument = () => reader.document.get()
  const recordIds = () => reader.record.ids() as readonly RecordId[]
  const recordList = () => reader.record.list() as readonly DataRecord[]
  const fieldIds = () => [
    TITLE_FIELD_ID,
    ...(reader.field.ids() as readonly FieldId[])
  ]
  const fieldList = () => [
    dataviewTitleField,
    ...(reader.field.list() as readonly Field[])
  ]
  const getField = (id: FieldId): Field | undefined => id === TITLE_FIELD_ID
    ? dataviewTitleField
    : reader.field.get(id)
  const getViewActiveId = () => documentViews.activeId.resolve(readDocument())

  const changes = (
    delta: DataviewMutationDelta
  ): DataviewDeltaQuery => {
    const api: DataviewDeltaQuery = {
      raw: delta,
      recordSetChanged: () => delta.reset === true
      || delta.record.create.changed()
      || delta.record.delete.changed(),
      touchedRecords: () => unionTouched<RecordId>([
      delta.record.create.touchedIds(),
      delta.record.delete.touchedIds(),
      delta.record.title.touchedIds(),
      delta.record.type.touchedIds(),
      delta.record.meta.touchedIds(),
      delta.record.values.touchedIds()
    ]),
      touchedViews: () => unionTouched<ViewId>([
      delta.view.create.touchedIds(),
      delta.view.delete.touchedIds(),
      delta.view.name.touchedIds(),
      delta.view.type.touchedIds(),
      delta.view.search.touchedIds(),
      delta.view.filter.touchedIds(),
      delta.view.sort.touchedIds(),
      delta.view.group.touchedIds(),
      delta.view.fields.touchedIds(),
      delta.view.calc.touchedIds(),
      delta.view.options.touchedIds(),
      delta.view.order.touchedIds()
    ]),
      touchedValueFields: () => {
      const touched = readChangedPathKeys<FieldId>(delta, 'record.values', 'values')
      if (touched === 'all') {
        return 'all'
      }

      return new Set<FieldId>(touched)
    },
      touchedFields: () => {
      const schemaTouched = api.fieldSchemaTouchedIds()
      const valueTouched = api.touchedValueFields()
      if (schemaTouched === 'all' || valueTouched === 'all') {
        return 'all'
      }

      const result = new Set<FieldId>()
      schemaTouched.forEach((fieldId) => result.add(fieldId))
      valueTouched.forEach((fieldId) => result.add(fieldId))
      if (delta.record.title.changed()) {
        result.add(TITLE_FIELD_ID)
      }
      return result
    },
      fieldSchemaTouchedIds: () => unionTouched<FieldId>([
      delta.field.name.touchedIds(),
      delta.field.kind.touchedIds(),
      delta.field.system.touchedIds(),
      delta.field.displayFullUrl.touchedIds(),
      delta.field.format.touchedIds(),
      delta.field.precision.touchedIds(),
      delta.field.currency.touchedIds(),
      delta.field.useThousandsSeparator.touchedIds(),
      delta.field.defaultOptionId.touchedIds(),
      delta.field.displayDateFormat.touchedIds(),
      delta.field.displayTimeFormat.touchedIds(),
      delta.field.defaultValueKind.touchedIds(),
      delta.field.defaultTimezone.touchedIds(),
      delta.field.multiple.touchedIds(),
      delta.field.accept.touchedIds(),
      delta.field.options.touchedIds()
    ]),
      fieldSchemaChanged: (fieldId) => {
      if (fieldId === TITLE_FIELD_ID) {
        return delta.record.title.changed()
      }

      if (fieldId === undefined) {
        return FIELD_SCHEMA_KEYS.some((key) => delta.field[key].changed())
      }

      return FIELD_SCHEMA_KEYS.some((key) => delta.field[key].changed(fieldId as Exclude<FieldId, typeof TITLE_FIELD_ID>))
    },
      viewQueryChanged: (viewId, aspect) => {
      if (aspect === undefined) {
        return delta.view.search.changed(viewId)
          || delta.view.filter.changed(viewId)
          || delta.view.sort.changed(viewId)
          || delta.view.group.changed(viewId)
          || delta.view.order.changed(viewId)
      }

      switch (aspect) {
        case 'search':
          return delta.view.search.changed(viewId)
        case 'filter':
          return delta.view.filter.changed(viewId)
        case 'sort':
          return delta.view.sort.changed(viewId)
        case 'group':
          return delta.view.group.changed(viewId)
        case 'order':
          return delta.view.order.changed(viewId)
      }
    },
      viewLayoutChanged: (viewId) => (
      delta.view.name.changed(viewId)
      || delta.view.type.changed(viewId)
      || delta.view.fields.changed(viewId)
      || delta.view.options.changed(viewId)
    )
    }

    return api
  }

  return {
    model: dataviewMutationModel,
    reader,
    document: readDocument,
    records: {
      ids: recordIds,
      list: recordList,
      get: (id) => reader.record.get(id),
      has: (id) => reader.record.has(id),
      normalize: (recordIdsValue, validIds) => normalizeRecordOrderIds(
        recordIdsValue,
        toRecordIdSet(validIds, recordIds)
      )
    },
    values: {
      get: (recordId, fieldId) => {
        const record = reader.record.get(recordId)
        if (!record) {
          return undefined
        }

        return fieldId === TITLE_FIELD_ID
          ? record.title
          : reader.record.values(recordId).get(fieldId as Exclude<FieldId, typeof TITLE_FIELD_ID>)
      }
    },
    fields: {
      ids: fieldIds,
      list: fieldList,
      get: getField,
      has: (id) => getField(id) !== undefined,
      known: (id) => id === TITLE_FIELD_ID || reader.field.has(id)
    },
    views: {
      ids: () => reader.view.ids() as readonly ViewId[],
      list: () => reader.view.list() as readonly View[],
      get: (id) => reader.view.get(id),
      has: (id) => reader.view.has(id),
      activeId: getViewActiveId,
      active: () => {
        const activeId = getViewActiveId()
        return activeId
          ? reader.view.get(activeId)
          : undefined
      }
    },
    changes
  }
}

export const createDataviewQueryContext = (
  document: DataDoc
): DataviewQueryContext => {
  const reader = createMutationReader(
    dataviewMutationModel,
    () => document
  )
  const query = createDataviewQuery(reader)
  const fieldIds = query.fields.ids()
  const fieldsById = new Map<FieldId, Field>()
  query.fields.list().forEach((field) => {
    fieldsById.set(field.id, field)
  })
  const activeView = query.views.active()

  return {
    document,
    reader,
    query,
    fieldIds,
    fieldIdSet: new Set(fieldIds),
    fieldsById,
    ...(activeView
      ? {
          activeViewId: activeView.id,
          activeView
        }
      : {})
  }
}

export const resolveRecordValueMap = (
  record: DataRecord | undefined
): Readonly<Record<string, unknown>> => record?.values ?? emptyRecord

export const readRecordFieldValue = (
  record: DataRecord | undefined,
  fieldId: FieldId
): unknown | undefined => record
  ? documentValues.get(record, fieldId)
  : undefined
