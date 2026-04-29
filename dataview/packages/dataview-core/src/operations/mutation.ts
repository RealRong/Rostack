import {
  documentViews
} from '@dataview/core/document/views'
import {
  createDataviewDraftDocument
} from '@dataview/core/operations/internal/draft'
import {
  commitAspects
} from '@dataview/core/operations/internal/aspects'
import {
  applyRecordFieldWriteInputToDraft,
  restoreRecordFieldsToDraft
} from '@dataview/core/operations/internal/recordFieldDraft'
import type {
  DocumentRecordFieldRestoreEntry,
  DocumentOperation
} from '@dataview/core/types/operations'
import type {
  CommitImpactViewChange,
  FieldSchemaAspect,
  RecordPatchAspect,
  ViewLayoutAspect,
  ViewQueryAspect
} from '@dataview/core/types/commit'
import type {
  CustomField,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  equal,
  entityTable
} from '@shared/core'
import type {
  MutationChangeInput,
  MutationCustomTable,
  MutationDeltaInput,
  MutationFootprint
} from '@shared/mutation'

type DataviewChangePayload = {
  recordAspects?: Record<string, readonly RecordPatchAspect[]>
  fieldAspects?: Record<string, readonly FieldSchemaAspect[]>
  viewQueryAspects?: Record<string, readonly ViewQueryAspect[]>
  viewLayoutAspects?: Record<string, readonly ViewLayoutAspect[]>
  viewCalculationFields?: Record<string, readonly FieldId[] | 'all'>
  activeView?: {
    before?: ViewId
    after?: ViewId
  }
  sources?: readonly string[]
}

const clone = <T>(
  value: T
): T => structuredClone(value)

const collectRecordValueFieldIds = (
  record: DataRecord
): readonly FieldId[] => [
  TITLE_FIELD_ID,
  ...Object.keys(record.values) as FieldId[]
]

const createEmptyDelta = (): MutationDeltaInput => ({
  changes: {}
})

const appendIdsChange = (
  delta: MutationDeltaInput,
  key: string,
  ids: readonly string[]
): void => {
  if (!ids.length) {
    return
  }

  delta.changes ??= {}
  delta.changes[key] = ids
}

const appendPathsChange = (
  delta: MutationDeltaInput,
  key: string,
  paths: Record<string, readonly string[]>,
  payload?: DataviewChangePayload
): void => {
  const ids = Object.keys(paths)
  if (!ids.length) {
    return
  }

  delta.changes ??= {}
  delta.changes[key] = {
    ids,
    paths,
    ...(payload ?? {})
  }
}

const appendObjectChange = (
  delta: MutationDeltaInput,
  key: string,
  change: MutationChangeInput
): void => {
  delta.changes ??= {}
  delta.changes[key] = change
}

const appendRecordValueChange = (
  delta: MutationDeltaInput,
  changes: readonly {
    recordId: RecordId
    changedFields: readonly FieldId[]
  }[]
): void => {
  const paths: Record<string, readonly string[]> = {}

  changes.forEach((change) => {
    if (!change.changedFields.length) {
      return
    }
    paths[change.recordId] = change.changedFields
  })

  appendPathsChange(delta, 'record.values', paths)
}

const appendRecordPatchChange = (
  delta: MutationDeltaInput,
  id: RecordId,
  aspects: readonly RecordPatchAspect[]
): void => {
  if (!aspects.length) {
    return
  }

  appendObjectChange(delta, 'record.patch', {
    ids: [id],
    recordAspects: {
      [id]: aspects
    }
  })
}

const appendFieldSchemaChange = (
  delta: MutationDeltaInput,
  id: string,
  aspects: readonly FieldSchemaAspect[]
): void => {
  if (!aspects.length) {
    return
  }

  appendObjectChange(delta, 'field.schema', {
    ids: [id],
    fieldAspects: {
      [id]: aspects
    }
  })
}

const appendViewChange = (
  delta: MutationDeltaInput,
  key: 'view.query' | 'view.layout' | 'view.calc',
  id: ViewId,
  payload: DataviewChangePayload
): void => {
  appendObjectChange(delta, key, {
    ids: [id],
    ...payload
  })
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

const createRecordInsertResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.record.insert' }>
) => {
  const nextRecords = entityTable.normalize.list(operation.records)
  const recordIds = nextRecords.ids

  if (!recordIds.length) {
    return
  }

  const recordIdSet = new Set(recordIds)
  const remainingIds = document.records.ids.filter((recordId) => !recordIdSet.has(recordId))
  const safeIndex = Math.max(
    0,
    Math.min(operation.target?.index ?? remainingIds.length, remainingIds.length)
  )
  const nextIds = [
    ...remainingIds.slice(0, safeIndex),
    ...recordIds,
    ...remainingIds.slice(safeIndex)
  ]

  const nextById = {
    ...document.records.byId
  }
  recordIds.forEach((recordId) => {
    const record = nextRecords.byId[recordId]
    if (record) {
      nextById[recordId] = record
    }
  })

  const nextDocument: DataDoc = {
    ...document,
    records: {
      byId: nextById,
      ids: nextIds
    }
  }

  if (
    equal.sameOrder(document.records.ids, nextIds)
    && recordIds.every((recordId) => Object.is(document.records.byId[recordId], nextById[recordId]))
  ) {
    return
  }

  const delta = createEmptyDelta()
  appendIdsChange(delta, 'record.create', recordIds)
  appendRecordValueChange(delta, recordIds.flatMap((recordId) => {
    const record = nextById[recordId]
    return record
      ? [{
          recordId,
          changedFields: collectRecordValueFieldIds(record)
        }]
      : []
  }))

  return {
    document: nextDocument,
    delta,
    footprint: [
      {
        kind: 'global' as const,
        family: 'record'
      },
      ...recordIds.map((recordId) => ({
        kind: 'entity' as const,
        family: 'record',
        id: recordId
      })),
      ...recordIds.flatMap((recordId) => {
        const record = nextById[recordId]
        return record
          ? createRecordValueFootprint(recordId, collectRecordValueFieldIds(record))
          : []
      })
    ],
    history: {
      inverse: [{
        type: 'document.record.remove',
        recordIds
      } satisfies DocumentOperation]
    }
  }
}

const createRecordPatchResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.record.patch' }>
) => {
  const beforeRecord = document.records.byId[operation.recordId]
  if (!beforeRecord) {
    return
  }

  const afterRecord = entityTable.patch.merge(
    beforeRecord,
    operation.patch as Partial<DataRecord>
  ) as DataRecord
  if (afterRecord === beforeRecord) {
    return
  }

  const nextDocument: DataDoc = {
    ...document,
    records: entityTable.write.put(document.records, afterRecord)
  }
  const aspects = commitAspects.record.patch(beforeRecord, afterRecord)
  const delta = createEmptyDelta()
  appendRecordPatchChange(delta, operation.recordId, aspects)

  return {
    document: nextDocument,
    delta,
    footprint: [{
      kind: 'entity' as const,
      family: 'record',
      id: operation.recordId
    }],
    history: {
      inverse: [{
        type: 'document.record.patch',
        recordId: operation.recordId,
        patch: Object.fromEntries(
          Object.keys(operation.patch).map((key) => [
            key,
            beforeRecord[key as keyof typeof beforeRecord]
          ])
        ) as Extract<DocumentOperation, { type: 'document.record.patch' }>['patch']
      } satisfies DocumentOperation]
    }
  }
}

const createRecordRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.record.remove' }>
) => {
  const removedEntries = operation.recordIds.flatMap((recordId) => {
    const record = document.records.byId[recordId]
    return record
      ? [{
          record,
          index: document.records.ids.indexOf(recordId)
        }]
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
  const delta = createEmptyDelta()
  appendIdsChange(delta, 'record.delete', removedEntries.map((entry) => entry.record.id))
  appendRecordValueChange(delta, removedEntries.map((entry) => ({
    recordId: entry.record.id,
    changedFields: collectRecordValueFieldIds(entry.record)
  })))

  return {
    document: nextDocument,
    delta,
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
        type: 'document.record.insert',
        records: [entry.record],
        target: {
          index: entry.index
        }
      } satisfies DocumentOperation))
    }
  }
}

const createRecordFieldWriteResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, {
    type: 'document.record.fields.writeMany' | 'document.record.fields.restoreMany'
  }>
) => {
  const draftDocument = createDataviewDraftDocument(document)
  const changes = operation.type === 'document.record.fields.writeMany'
    ? applyRecordFieldWriteInputToDraft(draftDocument.records, operation)
    : restoreRecordFieldsToDraft(draftDocument.records, operation.entries)

  if (!changes.length) {
    return
  }

  const nextDocument = draftDocument.finish()
  const delta = createEmptyDelta()
  appendRecordValueChange(delta, changes)
  changes.forEach((change) => {
    if (change.changedFields.includes(TITLE_FIELD_ID)) {
      appendRecordPatchChange(delta, change.recordId, ['title'])
    }
  })

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
    delta,
    footprint: changes.flatMap((change) => (
      createRecordValueFootprint(change.recordId, change.changedFields)
    )),
    history: {
      inverse: [{
        type: 'document.record.fields.restoreMany',
        entries: inverseEntries
      } satisfies DocumentOperation]
    }
  }
}

const createFieldPutResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.field.put' }>
) => {
  const beforeField = document.fields.byId[operation.field.id]
  const nextDocument: DataDoc = {
    ...document,
    fields: entityTable.write.put(document.fields, operation.field)
  }
  if (
    beforeField
    && equal.sameJsonValue(beforeField, operation.field)
  ) {
    return
  }

  const delta = createEmptyDelta()
  const aspects = commitAspects.field.schema(beforeField, operation.field)
  if (!beforeField) {
    appendIdsChange(delta, 'field.create', [operation.field.id])
  }
  appendFieldSchemaChange(delta, operation.field.id, aspects)

  return {
    document: nextDocument,
    delta,
    footprint: [
      ...(!beforeField
        ? [{
            kind: 'global' as const,
            family: 'field'
          }]
        : []),
      {
        kind: 'entity' as const,
        family: 'field',
        id: operation.field.id
      }
    ],
    history: {
      inverse: beforeField
        ? [{
            type: 'document.field.put',
            field: beforeField
          } satisfies DocumentOperation]
        : [{
            type: 'document.field.remove',
            id: operation.field.id
          } satisfies DocumentOperation]
    }
  }
}

const createFieldPatchResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.field.patch' }>
) => {
  const beforeField = document.fields.byId[operation.id]
  if (!beforeField) {
    return
  }

  const afterField = entityTable.patch.merge(
    beforeField,
    operation.patch as Partial<CustomField>
  ) as CustomField
  if (afterField === beforeField) {
    return
  }

  const nextDocument: DataDoc = {
    ...document,
    fields: entityTable.write.put(document.fields, afterField)
  }
  const aspects = commitAspects.field.schema(beforeField, afterField)
  const delta = createEmptyDelta()
  appendFieldSchemaChange(delta, operation.id, aspects)

  return {
    document: nextDocument,
    delta,
    footprint: [{
      kind: 'entity' as const,
      family: 'field',
      id: operation.id
    }],
    history: {
      inverse: [{
        type: 'document.field.patch',
        id: operation.id,
        patch: Object.fromEntries(
          Object.keys(operation.patch).map((key) => [
            key,
            beforeField[key as keyof typeof beforeField]
          ])
        ) as Extract<DocumentOperation, { type: 'document.field.patch' }>['patch']
      } satisfies DocumentOperation]
    }
  }
}

const createFieldRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.field.remove' }>
) => {
  const beforeField = document.fields.byId[operation.id]
  if (!beforeField) {
    return
  }

  const nextDocument: DataDoc = {
    ...document,
    fields: entityTable.write.remove(document.fields, operation.id)
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
  const delta = createEmptyDelta()
  appendIdsChange(delta, 'field.delete', [operation.id])
  appendFieldSchemaChange(delta, operation.id, ['all'])
  appendRecordValueChange(delta, affectedRecords)

  return {
    document: nextDocument,
    delta,
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
        type: 'document.field.put',
        field: beforeField
      } satisfies DocumentOperation]
    }
  }
}

const createViewPutResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.view.put' }>
) => {
  const beforeView = document.views.byId[operation.view.id]
  const beforeActiveViewId = document.activeViewId
  const nextViews = entityTable.write.put(document.views, operation.view)
  const nextDocumentBase: DataDoc = {
    ...document,
    views: nextViews
  }
  const afterActiveViewId = documentViews.activeId.resolve(
    nextDocumentBase,
    beforeActiveViewId ?? operation.view.id
  )
  const nextDocument: DataDoc = {
    ...nextDocumentBase,
    activeViewId: afterActiveViewId
  }

  const queryAspects = beforeView
    ? commitAspects.view.query(beforeView, operation.view)
    : []
  const layoutAspects = beforeView
    ? commitAspects.view.layout(beforeView, operation.view)
    : []
  const calculationFields = beforeView
    ? commitAspects.view.calculationFields(beforeView, operation.view)
    : undefined

  if (
    beforeView
    && !queryAspects.length
    && !layoutAspects.length
    && !calculationFields?.length
    && beforeActiveViewId === afterActiveViewId
    && equal.sameJsonValue(beforeView, operation.view)
  ) {
    return
  }

  const delta = createEmptyDelta()
  if (!beforeView) {
    appendIdsChange(delta, 'view.create', [operation.view.id])
  }
  if (queryAspects.length) {
    appendViewChange(delta, 'view.query', operation.view.id, {
      viewQueryAspects: {
        [operation.view.id]: queryAspects
      }
    })
  }
  if (layoutAspects.length) {
    appendViewChange(delta, 'view.layout', operation.view.id, {
      viewLayoutAspects: {
        [operation.view.id]: layoutAspects
      }
    })
  }
  if (calculationFields?.length) {
    appendViewChange(delta, 'view.calc', operation.view.id, {
      viewCalculationFields: {
        [operation.view.id]: calculationFields
      }
    })
  }
  if (beforeActiveViewId !== afterActiveViewId) {
    appendObjectChange(delta, 'document.activeView', {
      activeView: {
        before: beforeActiveViewId,
        after: afterActiveViewId
      }
    })
  }

  return {
    document: nextDocument,
    delta,
    footprint: [
      ...(!beforeView
        ? [{
            kind: 'global' as const,
            family: 'view'
          }]
        : []),
      {
        kind: 'entity' as const,
        family: 'view',
        id: operation.view.id
      }
    ],
    history: {
      inverse: beforeView
        ? [{
            type: 'document.view.put',
            view: beforeView
          } satisfies DocumentOperation]
        : [{
            type: 'document.view.remove',
            id: operation.view.id
          } satisfies DocumentOperation]
    }
  }
}

const createActiveViewSetResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.activeView.set' }>
) => {
  const beforeViewId = document.activeViewId
  const nextDocument: DataDoc = {
    ...document,
    activeViewId: documentViews.activeId.resolve(document, operation.id)
  }
  if (beforeViewId === nextDocument.activeViewId) {
    return
  }

  return {
    document: nextDocument,
    delta: {
      changes: {
        'document.activeView': {
          activeView: {
            before: beforeViewId,
            after: nextDocument.activeViewId
          }
        }
      }
    },
    footprint: [{
      kind: 'global' as const,
      family: 'activeView'
    }],
    history: {
      inverse: [{
        type: 'document.activeView.set',
        id: beforeViewId
      } satisfies DocumentOperation]
    }
  }
}

const createViewRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.view.remove' }>
) => {
  const beforeView = document.views.byId[operation.id]
  if (!beforeView) {
    return
  }

  const beforeActiveViewId = document.activeViewId
  const nextViews = entityTable.write.remove(document.views, operation.id)
  const nextDocument: DataDoc = {
    ...document,
    views: nextViews,
    activeViewId: documentViews.activeId.resolve(
      {
        ...document,
        views: nextViews
      },
      beforeActiveViewId === operation.id
        ? undefined
        : beforeActiveViewId
    )
  }
  const delta = createEmptyDelta()
  appendIdsChange(delta, 'view.delete', [operation.id])
  if (beforeActiveViewId !== nextDocument.activeViewId) {
    appendObjectChange(delta, 'document.activeView', {
      activeView: {
        before: beforeActiveViewId,
        after: nextDocument.activeViewId
      }
    })
  }

  return {
    document: nextDocument,
    delta,
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
      inverse: [{
        type: 'document.view.put',
        view: beforeView
      } satisfies DocumentOperation]
    }
  }
}

const createExternalVersionResult = (
  operation: Extract<DocumentOperation, { type: 'external.version.bump' }>
) => ({
  delta: {
    changes: {
      'external.version': {
        sources: [operation.source]
      }
    }
  },
  footprint: [{
    kind: 'global' as const,
    family: `external.${operation.source}`
  }],
  history: false as const
})

export const dataviewCustom: MutationCustomTable<
  DataDoc,
  DocumentOperation,
  void,
  string
> = {
  'document.record.insert': {
    reduce: ({ op, document }) => createRecordInsertResult(document, op)
  },
  'document.record.patch': {
    reduce: ({ op, document }) => createRecordPatchResult(document, op)
  },
  'document.record.remove': {
    reduce: ({ op, document }) => createRecordRemoveResult(document, op)
  },
  'document.record.fields.writeMany': {
    reduce: ({ op, document }) => createRecordFieldWriteResult(document, op)
  },
  'document.record.fields.restoreMany': {
    reduce: ({ op, document }) => createRecordFieldWriteResult(document, op)
  },
  'document.field.put': {
    reduce: ({ op, document }) => createFieldPutResult(document, op)
  },
  'document.field.patch': {
    reduce: ({ op, document }) => createFieldPatchResult(document, op)
  },
  'document.field.remove': {
    reduce: ({ op, document }) => createFieldRemoveResult(document, op)
  },
  'document.view.put': {
    reduce: ({ op, document }) => createViewPutResult(document, op)
  },
  'document.activeView.set': {
    reduce: ({ op, document }) => createActiveViewSetResult(document, op)
  },
  'document.view.remove': {
    reduce: ({ op, document }) => createViewRemoveResult(document, op)
  },
  'external.version.bump': {
    reduce: ({ op }) => createExternalVersionResult(op)
  }
} as const
