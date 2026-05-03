import type {
  CustomField,
  CustomFieldId,
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
  entityTable,
} from '@shared/core'
import {
  createMutationQuery,
  type MutationDocument,
} from '@shared/mutation'
import {
  dataviewMutationSchema,
  type DataviewMutationQuery,
} from './schema'
import {
  createDataviewChanges,
  type DataviewMutationChanges,
} from './change'

type RecordIdSource = readonly RecordId[] | ReadonlySet<RecordId>

const dataviewTitleField: Extract<Field, { kind: 'title' }> = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true,
  meta: undefined
}

export interface DataviewQuery {
  raw: DataviewMutationQuery
  document(): DataDoc
  changes(delta: import('./schema').DataviewMutationDelta): DataviewMutationChanges
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
}

export interface DataviewQueryContext {
  document: DataDoc
  query: DataviewQuery
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
  fieldsById: ReadonlyMap<FieldId, Field>
  activeViewId?: ViewId
  activeView?: View
}

const toRecordIdSet = (
  validIds: RecordIdSource | undefined,
  fallback: () => readonly RecordId[]
): ReadonlySet<RecordId> => {
  if (validIds instanceof Set) {
    return validIds
  }

  return new Set(validIds ?? fallback())
}

export const createDataviewQuery = (
  raw: DataviewMutationQuery
): DataviewQuery => {
  const recordIds = () => raw.records.ids() as readonly RecordId[]
  const fieldIds = (): readonly FieldId[] => [
    TITLE_FIELD_ID,
    ...(raw.fields.ids() as readonly CustomFieldId[])
  ]
  const viewIds = () => raw.views.ids() as readonly ViewId[]
  const getRecord = (recordId: RecordId): DataRecord | undefined =>
    raw.records.get(recordId) as DataRecord | undefined
  const getField = (fieldId: FieldId): Field | undefined => {
    if (fieldId === TITLE_FIELD_ID) {
      return dataviewTitleField
    }
    return raw.fields.get(fieldId as CustomFieldId) as Field | undefined
  }
  const getView = (viewId: ViewId): View | undefined =>
    raw.views.get(viewId) as View | undefined

  const readDocument = (): DataDoc => {
    const activeViewId = raw.document.activeViewId() as ViewId | undefined
    const meta = raw.document.meta() as DataDoc['meta']

    return {
      schemaVersion: raw.document.schemaVersion() as DataDoc['schemaVersion'],
      records: entityTable.normalize.list(recordIds().flatMap((recordId) => {
        const record = getRecord(recordId)
        return record ? [record] : []
      })),
      fields: entityTable.normalize.list((raw.fields.ids() as readonly CustomFieldId[]).flatMap((fieldId) => {
        const field = getField(fieldId)
        return field && field.kind !== 'title'
          ? [field] : []
      })),
      views: entityTable.normalize.list(viewIds().flatMap((viewId) => {
        const view = getView(viewId)
        return view ? [view] : []
      })),
      activeViewId,
      meta
    }
  }

  const getActiveViewId = (): ViewId | undefined => {
    const activeViewId = raw.document.activeViewId() as ViewId | undefined
    if (activeViewId && raw.views.has(activeViewId)) {
      return activeViewId as ViewId
    }

    return viewIds()[0]
  }

  const query: DataviewQuery = {
    raw,
    document: readDocument,
    changes: (delta) => createDataviewChanges(query, delta),
    records: {
      ids: recordIds,
      list: () => recordIds().flatMap((recordId) => {
        const record = getRecord(recordId)
        return record ? [record] : []
      }),
      get: getRecord,
      has: (id) => raw.records.has(id),
      normalize: (recordIdsInput, validIds) => {
        const validIdSet = toRecordIdSet(validIds, recordIds)
        const source = recordIdsInput ?? recordIds()
        return source.filter((recordId) => validIdSet.has(recordId))
      }
    },
    values: {
      get: (recordId, fieldId) => {
        if (!raw.records.has(recordId)) {
          return undefined
        }
        if (fieldId === TITLE_FIELD_ID) {
          return raw.records(recordId).title()
        }

        return raw.records(recordId).values.get(fieldId as CustomFieldId)
      }
    },
    fields: {
      ids: fieldIds,
      list: () => fieldIds().flatMap((fieldId) => {
        const field = getField(fieldId)
        return field ? [field] : []
      }),
      get: getField,
      has: (id) => id === TITLE_FIELD_ID || raw.fields.has(id as CustomFieldId),
      known: (id) => id === TITLE_FIELD_ID || raw.fields.has(id as CustomFieldId)
    },
    views: {
      ids: viewIds,
      list: () => viewIds().flatMap((viewId) => {
        const view = getView(viewId)
        return view ? [view] : []
      }),
      get: getView,
      has: (id) => raw.views.has(id),
      activeId: getActiveViewId,
      active: () => {
        const activeViewId = getActiveViewId()
        return activeViewId
          ? getView(activeViewId)
          : undefined
      }
    }
  }

  return query
}

export const createDataviewQueryContext = (
  document: DataDoc
): DataviewQueryContext => {
  const raw = createMutationQuery(
    dataviewMutationSchema,
    document as MutationDocument<typeof dataviewMutationSchema>
  )
  const query = createDataviewQuery(raw)
  const ids = query.fields.ids()
  const fieldIdSet = new Set(ids)
  const fieldsById = new Map<FieldId, Field>()

  query.fields.list().forEach((field) => {
    fieldsById.set(field.id, field)
  })

  return {
    document,
    query,
    fieldIds: ids,
    fieldIdSet,
    fieldsById,
    activeViewId: query.views.activeId(),
    activeView: query.views.active()
  }
}
