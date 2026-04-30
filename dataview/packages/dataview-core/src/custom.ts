import {
  documentViews
} from '@dataview/core/document/views'
import {
  createDataviewDraftDocument
} from './custom-draft'
import {
  applyRecordFieldWriteInputToDraft,
  restoreRecordFieldsToDraft
} from './custom-recordFieldDraft'
import type {
  DocumentRecordFieldRestoreEntry,
  DocumentOperation
} from '@dataview/core/op'
import type {
  DataDoc,
  DataRecord,
  FieldId,
  RecordId
} from '@dataview/core/types'
import type {
  DocumentReader
} from '@dataview/core/document/reader'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  entityTable
} from '@shared/core'
import {
  type MutationDelta,
  type MutationCustomTable,
  type MutationFootprint
} from '@shared/mutation'
import {
  dataviewMutationBuilder,
  type DataviewMutationSchema
} from '@dataview/core/mutation'
type DataviewMutationIdsKey = Extract<
  keyof DataviewMutationSchema & string,
  'record.delete' | 'field.delete' | 'view.delete'
>

const toMutationDelta = (
  delta: MutationDelta | undefined
): MutationDelta | undefined => delta

const createIdsDelta = (
  key: DataviewMutationIdsKey,
  ids: readonly string[]
) => ids.length
  ? toMutationDelta(dataviewMutationBuilder.ids(key, ids) as MutationDelta)
  : undefined

const collectRecordValueFieldIds = (
  record: DataRecord
): readonly FieldId[] => [
  TITLE_FIELD_ID,
  ...Object.keys(record.values) as FieldId[]
]

const createRecordValueDelta = (
  changes: readonly {
    recordId: RecordId
    changedFields: readonly FieldId[]
  }[]
) => {
  const titlePaths: Record<string, readonly string[]> = {}
  const valuePaths: Record<string, readonly string[]> = {}

  changes.forEach((change) => {
    const values: string[] = []

    change.changedFields.forEach((fieldId) => {
      if (fieldId === TITLE_FIELD_ID) {
        titlePaths[change.recordId] = ['title']
        return
      }

      values.push(fieldId)
    })

    if (values.length) {
      valuePaths[change.recordId] = values
    }
  })

  return toMutationDelta(dataviewMutationBuilder.merge(
    Object.keys(titlePaths).length
      ? dataviewMutationBuilder.paths('record.title', titlePaths)
      : undefined,
    Object.keys(valuePaths).length
      ? dataviewMutationBuilder.paths('record.values', valuePaths)
      : undefined
  ) as MutationDelta)
}

const createRecordValueFootprint = (
  recordId: RecordId,
  fieldIds: readonly FieldId[]
): readonly MutationFootprint[] => fieldIds.flatMap((fieldId) => ([
  {
    kind: 'relation',
    family: 'record',
    id: recordId,
    relation: 'values',
    target: fieldId
  },
  {
    kind: 'relation',
    family: 'field',
    id: fieldId,
    relation: 'values',
    target: recordId
  }
]))

const createRecordRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'record.remove' }>
) => {
  const removedEntries = operation.recordIds.flatMap((recordId) => {
    const record = document.records.byId[recordId]
    return record
      ? [{ record }]
      : []
  })
  if (!removedEntries.length) {
    return
  }

  const nextDocument: DataDoc = {
    ...document,
    records: removedEntries.reduce(
      (table, entry) => entityTable.write.remove(table, entry.record.id),
      document.records
    )
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.merge(
      createIdsDelta('record.delete', removedEntries.map((entry) => entry.record.id)),
      createRecordValueDelta(removedEntries.map((entry) => ({
        recordId: entry.record.id,
        changedFields: collectRecordValueFieldIds(entry.record)
      })))
    ) as MutationDelta),
    footprint: [
      {
        kind: 'global' as const,
        family: 'record'
      },
      ...removedEntries.map((entry) => ({
        kind: 'entity' as const,
        family: 'record',
        id: entry.record.id
      })),
      ...removedEntries.flatMap((entry) => (
        createRecordValueFootprint(entry.record.id, collectRecordValueFieldIds(entry.record))
      ))
    ],
    history: {
      inverse: removedEntries.map((entry) => ({
        type: 'record.create',
        value: entry.record
      } satisfies DocumentOperation))
    }
  }
}

const createRecordValueWriteResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, {
    type: 'record.values.writeMany' | 'record.values.restoreMany'
  }>
) => {
  const draftDocument = createDataviewDraftDocument(document)
  const changes = operation.type === 'record.values.writeMany'
    ? applyRecordFieldWriteInputToDraft(draftDocument.records, operation)
    : restoreRecordFieldsToDraft(draftDocument.records, operation.entries)

  if (!changes.length) {
    return
  }

  const nextDocument = draftDocument.finish()
  const inverseEntries = changes.map((change): DocumentRecordFieldRestoreEntry => ({
    recordId: change.recordId,
    ...(change.restoreSet
      ? { set: change.restoreSet }
      : {}),
    ...(change.restoreClear?.length
      ? { clear: change.restoreClear }
      : {})
  }))

  return {
    document: nextDocument,
    delta: createRecordValueDelta(changes),
    footprint: changes.flatMap((change) => (
      createRecordValueFootprint(change.recordId, change.changedFields)
    )),
    history: {
      inverse: [{
        type: 'record.values.restoreMany',
        entries: inverseEntries
      } satisfies DocumentOperation]
    }
  }
}

const createFieldRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'field.remove' }>
) => {
  const beforeField = document.fields.byId[operation.id]
  if (!beforeField) {
    return
  }

  const affectedRecords = document.records.ids.flatMap((recordId) => {
    const record = document.records.byId[recordId]
    return record && Object.prototype.hasOwnProperty.call(record.values, operation.id)
      ? [{
          recordId,
          changedFields: [operation.id] as const
        }]
      : []
  })

  const nextRecords = affectedRecords.reduce((table, change) => {
    const current = table.byId[change.recordId]
    if (!current) {
      return table
    }

    const nextValues = {
      ...current.values
    }
    delete nextValues[operation.id]
    return entityTable.write.put(table, {
      ...current,
      values: nextValues
    })
  }, document.records)

  const nextDocument: DataDoc = {
    ...document,
    fields: entityTable.write.remove(document.fields, operation.id),
    records: nextRecords
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.merge(
      createIdsDelta('field.delete', [operation.id]),
      createRecordValueDelta(affectedRecords)
    ) as MutationDelta),
    footprint: [
      {
        kind: 'global' as const,
        family: 'field'
      },
      {
        kind: 'entity' as const,
        family: 'field',
        id: operation.id
      },
      ...affectedRecords.flatMap((change) => (
        createRecordValueFootprint(change.recordId, change.changedFields)
      ))
    ],
    history: {
      inverse: [{
        type: 'field.create',
        value: beforeField
      } satisfies DocumentOperation]
    }
  }
}

const createViewOpenResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.open' }>
) => {
  const beforeViewId = document.activeViewId
  const nextDocument = documentViews.activeId.set(document, operation.id)
  if (beforeViewId === nextDocument.activeViewId) {
    return
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.flag('document.activeViewId') as MutationDelta),
    footprint: [{
      kind: 'global' as const,
      family: 'document'
    }],
    history: {
      inverse: [{
        type: 'document.patch',
        patch: {
          activeViewId: beforeViewId
        }
      } satisfies DocumentOperation]
    }
  }
}

const createViewRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.remove' }>
) => {
  const beforeView = document.views.byId[operation.id]
  if (!beforeView) {
    return
  }

  const beforeActiveViewId = document.activeViewId
  const nextDocument = documentViews.remove(document, operation.id)
  const inverse: DocumentOperation[] = [{
    type: 'view.create',
    value: beforeView
  }]
  const deltaInputs = [
    createIdsDelta('view.delete', [operation.id]),
    beforeActiveViewId !== nextDocument.activeViewId
      ? toMutationDelta(dataviewMutationBuilder.flag('document.activeViewId') as MutationDelta)
      : undefined
  ] as const

  if (beforeActiveViewId !== nextDocument.activeViewId) {
    inverse.push({
      type: 'document.patch',
      patch: {
        activeViewId: beforeActiveViewId
      }
    })
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.merge(...deltaInputs) as MutationDelta),
    footprint: [
      {
        kind: 'global' as const,
        family: 'view'
      },
      {
        kind: 'entity' as const,
        family: 'view',
        id: operation.id
      }
    ],
    history: {
      inverse
    }
  }
}

const createExternalVersionResult = (
  operation: Extract<DocumentOperation, { type: 'external.version.bump' }>
) => ({
  delta: toMutationDelta(dataviewMutationBuilder.flag('external.version') as MutationDelta),
  footprint: [] as const,
  history: false as const,
  outputs: [operation.source]
})

export const dataviewCustom: MutationCustomTable<
  DataDoc,
  DocumentOperation,
  DocumentReader,
  void
> = {
  'record.remove': {
    reduce: ({ op, document }) => createRecordRemoveResult(document, op)
  },
  'record.values.writeMany': {
    reduce: ({ op, document }) => createRecordValueWriteResult(document, op)
  },
  'record.values.restoreMany': {
    reduce: ({ op, document }) => createRecordValueWriteResult(document, op)
  },
  'field.remove': {
    reduce: ({ op, document }) => createFieldRemoveResult(document, op)
  },
  'view.open': {
    reduce: ({ op, document }) => createViewOpenResult(document, op)
  },
  'view.remove': {
    reduce: ({ op, document }) => createViewRemoveResult(document, op)
  },
  'external.version.bump': {
    reduce: ({ op }) => createExternalVersionResult(op)
  }
}

export {
  dataviewCustom as custom
}
