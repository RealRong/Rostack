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
  entityTable as sharedEntityTable
} from '@shared/core'
import {
  documentFields
} from '@dataview/core/document/fields'
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
  return {
    document: readDocument,
    records: {
      ids: () => sharedEntityTable.read.ids(readDocument().records),
      list: () => sharedEntityTable.read.list(readDocument().records),
      get: (id) => sharedEntityTable.read.get(readDocument().records, id),
      has: (id) => sharedEntityTable.read.get(readDocument().records, id) !== undefined,
      normalize: (recordIds, validIds) => normalizeRecordOrderIds(
        recordIds,
        toRecordIdSet(validIds, () => sharedEntityTable.read.ids(readDocument().records))
      )
    },
    values: {
      get: (recordId, fieldId) => {
        const record = sharedEntityTable.read.get(readDocument().records, recordId)
        return record
          ? documentValues.get(record, fieldId)
          : undefined
      }
    },
    fields: {
      ids: () => documentFields.ids(readDocument()),
      list: () => documentFields.list(readDocument()),
      get: (id) => documentFields.get(readDocument(), id),
      has: (id) => documentFields.get(readDocument(), id) !== undefined
    },
    views: {
      ids: () => documentViews.ids(readDocument()),
      list: () => documentViews.list(readDocument()),
      get: (id) => documentViews.get(readDocument(), id),
      has: (id) => documentViews.get(readDocument(), id) !== undefined,
      activeId: () => documentViews.activeId.resolve(readDocument()),
      active: () => {
        const document = readDocument()
        const viewId = documentViews.activeId.resolve(document)
        return viewId
          ? documentViews.get(document, viewId)
          : undefined
      }
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
