import type {
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types'
import {
  documentFields
} from '@dataview/core/document/fields'
import {
  documentRecords
} from '@dataview/core/document/records'
import {
  documentValues
} from '@dataview/core/document/values'
import {
  documentViews
} from '@dataview/core/document/views'
import { normalizeRecordOrderIds } from '@dataview/core/view/order'

export interface EntityReader<TId extends string, TEntity> {
  ids(): readonly TId[]
  list(): readonly TEntity[]
  get(id: TId): TEntity | undefined
  has(id: TId): boolean
}

type RecordIdSource = readonly RecordId[] | ReadonlySet<RecordId>

export interface RecordReader extends EntityReader<RecordId, DataRecord> {
  normalize(
    recordIds: readonly RecordId[] | undefined,
    validIds?: RecordIdSource
  ): RecordId[]
}

export interface DocumentReader {
  document(): DataDoc
  records: RecordReader
  values: {
    get(recordId: RecordId, fieldId: FieldId): unknown | undefined
  }
  fields: EntityReader<FieldId, Field>
  views: EntityReader<ViewId, View> & {
    activeId(): ViewId | undefined
    active(): View | undefined
  }
}

export interface DocumentReadContext {
  document: DataDoc
  reader: DocumentReader
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
  fieldsById: ReadonlyMap<FieldId, Field>
  activeViewId?: ViewId
  activeView?: View
}

const createEntityReader = <TId extends string, TEntity>(input: {
  readDocument: () => DataDoc
  ids: (document: DataDoc) => readonly TId[]
  list: (document: DataDoc) => readonly TEntity[]
  get: (document: DataDoc, id: TId) => TEntity | undefined
}): EntityReader<TId, TEntity> => ({
  ids: () => input.ids(input.readDocument()),
  list: () => input.list(input.readDocument()),
  get: id => input.get(input.readDocument(), id),
  has: id => input.get(input.readDocument(), id) !== undefined
})

const toRecordIdSet = (
  validIds: RecordIdSource | undefined,
  fallback: () => readonly RecordId[]
): ReadonlySet<RecordId> => {
  if (validIds instanceof Set) {
    return validIds
  }

  return new Set(validIds ?? fallback())
}

export const createDocumentReader = (
  readDocument: () => DataDoc
): DocumentReader => {
  const records = createEntityReader({
    readDocument,
    ids: documentRecords.ids,
    list: documentRecords.list,
    get: documentRecords.get
  })

  return {
    document: readDocument,
    records: {
      ...records,
      normalize: (recordIds, validIds) => normalizeRecordOrderIds(
        recordIds,
        toRecordIdSet(validIds, records.ids)
      )
    },
    values: {
      get: (recordId, fieldId) => {
        const record = records.get(recordId)
        return record
          ? documentValues.get(record, fieldId)
          : undefined
      }
    },
    fields: createEntityReader({
      readDocument,
      ids: documentFields.ids,
      list: documentFields.list,
      get: documentFields.get
    }),
    views: {
      ...createEntityReader({
        readDocument,
        ids: documentViews.ids,
        list: documentViews.list,
        get: documentViews.get
      }),
      activeId: () => documentViews.activeId.get(readDocument()),
      active: () => documentViews.active.get(readDocument())
    }
  }
}

export const createDocumentReadContext = (
  document: DataDoc
): DocumentReadContext => {
  const reader = createDocumentReader(() => document)
  const fields = reader.fields.list()
  const fieldIds: FieldId[] = []
  const fieldsById = new Map<FieldId, Field>()

  fields.forEach(field => {
    fieldIds.push(field.id)
    fieldsById.set(field.id, field)
  })

  const activeView = reader.views.active()

  return {
    document,
    reader,
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
