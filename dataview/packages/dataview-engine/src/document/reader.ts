import type {
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentActiveView,
  getDocumentActiveViewId,
  getDocumentFieldById,
  getDocumentFieldIds,
  getDocumentFields,
  getDocumentRecordById,
  getDocumentRecordIds,
  getDocumentRecords,
  getDocumentViewById,
  getDocumentViewIds,
  getDocumentViews
} from '@dataview/core/document'
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
  fields: EntityReader<FieldId, Field>
  views: EntityReader<ViewId, View> & {
    activeId(): ViewId | undefined
    active(): View | undefined
  }
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

export const createLiveDocumentReader = (
  readDocument: () => DataDoc
): DocumentReader => {
  const records = createEntityReader({
    readDocument,
    ids: getDocumentRecordIds,
    list: getDocumentRecords,
    get: getDocumentRecordById
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
    fields: createEntityReader({
      readDocument,
      ids: getDocumentFieldIds,
      list: getDocumentFields,
      get: getDocumentFieldById
    }),
    views: {
      ...createEntityReader({
        readDocument,
        ids: getDocumentViewIds,
        list: getDocumentViews,
        get: getDocumentViewById
      }),
      activeId: () => getDocumentActiveViewId(readDocument()),
      active: () => getDocumentActiveView(readDocument())
    }
  }
}

export const createStaticDocumentReader = (
  document: DataDoc
): DocumentReader => createLiveDocumentReader(() => document)
