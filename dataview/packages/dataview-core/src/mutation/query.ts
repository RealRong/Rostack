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
type DataviewQuerySource = DataDoc | DataviewMutationQuery

const dataviewTitleField: Extract<Field, { kind: 'title' }> = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true,
  meta: undefined
}

export interface DataviewQuery {
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

const toRecordIdSet = (
  validIds: RecordIdSource | undefined,
  fallback: () => readonly RecordId[]
): ReadonlySet<RecordId> => {
  if (validIds instanceof Set) {
    return validIds
  }

  return new Set(validIds ?? fallback())
}

const isDataviewMutationQuery = (
  input: DataviewQuerySource
): input is DataviewMutationQuery => typeof (input as DataviewMutationQuery).records === 'function'

export const createDataviewQuery = (
  input: DataviewQuerySource
): DataviewQuery => {
  const raw = isDataviewMutationQuery(input)
    ? input
    : createMutationQuery(
        dataviewMutationSchema,
        input as MutationDocument<typeof dataviewMutationSchema>
      )
  const recordIds = () => raw.records.ids() as readonly RecordId[]
  const fieldIds = (): readonly FieldId[] => [
    TITLE_FIELD_ID,
    ...(raw.fields.ids() as readonly CustomFieldId[])
  ]
  const viewIds = () => raw.views.ids() as readonly ViewId[]
  const getRecord = (recordId: RecordId): DataRecord | undefined => {
    const value = raw.records.get(recordId)
    return value
      ? {
          id: recordId,
          ...value
        } as DataRecord
      : undefined
  }
  const getField = (fieldId: FieldId): Field | undefined => {
    if (fieldId === TITLE_FIELD_ID) {
      return dataviewTitleField
    }
    const value = raw.fields.get(fieldId as CustomFieldId)
    return value
      ? {
          id: fieldId,
          ...value
        } as Field
      : undefined
  }
  const getView = (viewId: ViewId): View | undefined => {
    const value = raw.views.get(viewId)
    return value
      ? {
          id: viewId,
          ...value
        } as View
      : undefined
  }

  const getActiveViewId = (): ViewId | undefined => {
    const activeViewId = raw.activeViewId() as ViewId | undefined
    if (activeViewId && raw.views.has(activeViewId)) {
      return activeViewId as ViewId
    }

    return viewIds()[0]
  }

  const query: DataviewQuery = {
    changes: (delta) => createDataviewChanges(raw, query, delta),
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
