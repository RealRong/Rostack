import type {
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

type RecordIdSource = readonly RecordId[] | ReadonlySet<RecordId>

const dataviewTitleField: Extract<Field, { kind: 'title' }> = {
  id: TITLE_FIELD_ID,
  name: 'Title',
  kind: 'title',
  system: true,
  meta: undefined
}

export interface DataviewQuery {
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

const listOrdered = <TId extends string, TValue>(
  ids: readonly TId[],
  byId: Readonly<Record<TId, TValue | undefined>>
): readonly TValue[] => ids.flatMap((id) => {
  const value = byId[id]
  return value ? [value] : []
})

export const createDataviewQuery = (
  document: DataDoc
): DataviewQuery => {
  const recordIds = () => document.records.ids
  const fieldIds = (): readonly FieldId[] => [
    TITLE_FIELD_ID,
    ...document.fields.ids
  ]
  const viewIds = () => document.views.ids
  const getActiveViewId = (): ViewId | undefined => {
    const activeViewId = document.activeViewId
    if (activeViewId && document.views.byId[activeViewId]) {
      return activeViewId
    }

    return viewIds()[0]
  }

  return {
    records: {
      ids: recordIds,
      list: () => listOrdered(document.records.ids, document.records.byId),
      get: (id) => document.records.byId[id],
      has: (id) => document.records.byId[id] !== undefined,
      normalize: (recordIdsInput, validIds) => {
        const validIdSet = toRecordIdSet(validIds, recordIds)
        const source = recordIdsInput ?? recordIds()
        return source.filter((recordId) => validIdSet.has(recordId))
      }
    },
    values: {
      get: (recordId, fieldId) => {
        const record = document.records.byId[recordId]
        if (!record) {
          return undefined
        }
        if (fieldId === TITLE_FIELD_ID) {
          return record.title
        }

        return record.values[fieldId as CustomFieldId]
      }
    },
    fields: {
      ids: fieldIds,
      list: () => [
        dataviewTitleField,
        ...listOrdered(document.fields.ids, document.fields.byId)
      ],
      get: (id) => id === TITLE_FIELD_ID
        ? dataviewTitleField
        : document.fields.byId[id as CustomFieldId],
      has: (id) => id === TITLE_FIELD_ID || document.fields.byId[id as CustomFieldId] !== undefined,
      known: (id) => id === TITLE_FIELD_ID || document.fields.byId[id as CustomFieldId] !== undefined
    },
    views: {
      ids: viewIds,
      list: () => listOrdered(document.views.ids, document.views.byId),
      get: (id) => document.views.byId[id],
      has: (id) => document.views.byId[id] !== undefined,
      activeId: getActiveViewId,
      active: () => {
        const activeViewId = getActiveViewId()
        return activeViewId
          ? document.views.byId[activeViewId]
          : undefined
      }
    }
  }
}
