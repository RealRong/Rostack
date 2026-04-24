import type {
  CommitImpact,
  CommitImpactViewChange,
  FieldSchemaAspect,
  RecordPatchAspect,
  ViewLayoutAspect,
  ViewQueryAspect
} from '@dataview/core/contracts/commit'
import type {
  DocumentOperation,
  DocumentRecordFieldRestoreEntry
} from '@dataview/core/contracts/operations'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import {
  impact as commitImpact
} from '@dataview/core/commit/impact'
import {
  type AppliedDocumentRecordFieldWrite,
  document as documentApi
} from '@dataview/core/document'
import { equal, json, type InverseBuilder } from '@shared/core'

export interface DocumentOperationRuntime {
  doc(): DataDoc
  replace(document: DataDoc): void
  inverse: Pick<InverseBuilder<DocumentOperation>, 'prependMany'>
}

const addSetValue = <T>(
  current: Set<T> | undefined,
  value: T
): Set<T> => {
  const next = current ?? new Set<T>()
  next.add(value)
  return next
}

const addSetValues = <T>(
  current: Set<T> | undefined,
  values: readonly T[]
): Set<T> | undefined => {
  if (!values.length) {
    return current
  }

  const next = current ?? new Set<T>()
  values.forEach(value => next.add(value))
  return next
}

const ensurePatchedRecord = (
  impact: CommitImpact,
  recordId: RecordId
): Set<RecordPatchAspect> => {
  const records = impact.records ?? (impact.records = {})
  const patched = records.patched ?? (records.patched = new Map())
  const aspects = patched.get(recordId) ?? new Set<RecordPatchAspect>()
  if (!patched.has(recordId)) {
    patched.set(recordId, aspects)
  }
  return aspects
}

const ensureFieldSchema = (
  impact: CommitImpact,
  fieldId: FieldId
): Set<FieldSchemaAspect> => {
  const fields = impact.fields ?? (impact.fields = {})
  const schema = fields.schema ?? (fields.schema = new Map())
  const aspects = schema.get(fieldId) ?? new Set<FieldSchemaAspect>()
  if (!schema.has(fieldId)) {
    schema.set(fieldId, aspects)
  }
  return aspects
}

const ensureValueTouched = (
  impact: CommitImpact,
  recordId: RecordId
): Set<FieldId> => {
  const values = impact.values ?? (impact.values = {})
  const touched = values.touched === 'all'
    ? undefined
    : (values.touched ?? (values.touched = new Map()))
  if (!touched) {
    return new Set<FieldId>()
  }
  const fieldIds = touched.get(recordId) ?? new Set<FieldId>()
  if (!touched.has(recordId)) {
    touched.set(recordId, fieldIds)
  }
  return fieldIds
}

const ensureViewChange = (
  impact: CommitImpact,
  viewId: ViewId
): CommitImpactViewChange => {
  const views = impact.views ?? (impact.views = {})
  const changed = views.changed ?? (views.changed = new Map())
  const change = changed.get(viewId) ?? {}
  if (!changed.has(viewId)) {
    changed.set(viewId, change)
  }
  return change
}

const markTouchedRecord = (
  impact: CommitImpact,
  recordId: RecordId
) => {
  if (impact.records?.touched === 'all') {
    return
  }

  const records = impact.records ?? (impact.records = {})
  records.touched = addSetValue(records.touched as Set<RecordId> | undefined, recordId)
}

const markValueTouched = (
  impact: CommitImpact,
  recordId: RecordId,
  fieldId: FieldId
) => {
  if (impact.values?.touched !== 'all') {
    ensureValueTouched(impact, recordId).add(fieldId)
  }

  const fields = impact.fields ?? (impact.fields = {})
  if (fields.touched !== 'all') {
    fields.touched = addSetValue(fields.touched as Set<FieldId> | undefined, fieldId)
  }
}

const markRecordPatch = (
  impact: CommitImpact,
  recordId: RecordId,
  aspects: readonly RecordPatchAspect[]
) => {
  if (!aspects.length) {
    return
  }

  markTouchedRecord(impact, recordId)
  const target = ensurePatchedRecord(impact, recordId)
  aspects.forEach(aspect => {
    target.add(aspect)
    if (aspect === 'title') {
      markValueTouched(impact, recordId, TITLE_FIELD_ID)
    }
  })
}

const markFieldSchema = (
  impact: CommitImpact,
  fieldId: FieldId,
  aspects: readonly FieldSchemaAspect[]
) => {
  if (!aspects.length) {
    return
  }

  const target = ensureFieldSchema(impact, fieldId)
  const fields = impact.fields ?? (impact.fields = {})
  fields.schemaTouched = addSetValue(fields.schemaTouched, fieldId)
  if (fields.touched !== 'all') {
    fields.touched = addSetValue(fields.touched as Set<FieldId> | undefined, fieldId)
  }
  aspects.forEach(aspect => target.add(aspect))
}

const markTouchedView = (
  impact: CommitImpact,
  viewId: ViewId
) => {
  const views = impact.views ?? (impact.views = {})
  if (views.touched !== 'all') {
    views.touched = addSetValue(views.touched as Set<ViewId> | undefined, viewId)
  }
}

const markViewQuery = (
  impact: CommitImpact,
  viewId: ViewId,
  aspects: readonly ViewQueryAspect[]
) => {
  if (!aspects.length) {
    return
  }

  const change = ensureViewChange(impact, viewId)
  markTouchedView(impact, viewId)
  change.queryAspects = addSetValues(change.queryAspects, aspects)
}

const markViewLayout = (
  impact: CommitImpact,
  viewId: ViewId,
  aspects: readonly ViewLayoutAspect[]
) => {
  if (!aspects.length) {
    return
  }

  const change = ensureViewChange(impact, viewId)
  markTouchedView(impact, viewId)
  change.layoutAspects = addSetValues(change.layoutAspects, aspects)
}

const markViewCalculations = (
  impact: CommitImpact,
  viewId: ViewId,
  fieldIds: readonly FieldId[] | undefined
) => {
  if (!fieldIds?.length) {
    return
  }

  const change = ensureViewChange(impact, viewId)
  markTouchedView(impact, viewId)
  if (change.calculationFields === 'all') {
    return
  }

  change.calculationFields = addSetValues(change.calculationFields, fieldIds)
}

const mergeActiveViewImpact = (
  impact: CommitImpact,
  before: ViewId | undefined,
  after: ViewId | undefined
) => {
  if (before === after) {
    return
  }

  impact.activeView = impact.activeView
    ? {
        before: impact.activeView.before,
        after
      }
    : {
        before,
        after
      }
}

const collectInsertedRecordIds = (
  records: readonly DataRecord[]
): readonly RecordId[] => {
  const ids: RecordId[] = []
  documentApi.records.enumerate(records, entry => {
    ids.push(entry.record.id)
  })
  return ids
}

const captureRecordEntries = (
  document: DataDoc,
  recordIds: readonly RecordId[]
) => recordIds
  .map(recordId => {
    const record = documentApi.records.get(document, recordId)
    const index = documentApi.records.indexOf(document, recordId)
    if (!record || index < 0) {
      return undefined
    }

    return {
      record,
      index
    }
  })
  .filter((entry): entry is { record: DataRecord; index: number } => Boolean(entry))
  .sort((left, right) => left.index - right.index)

const createRecordFieldRestoreEntry = (
  change: AppliedDocumentRecordFieldWrite
): DocumentRecordFieldRestoreEntry => ({
  recordId: change.recordId,
  ...(change.restoreSet
    ? { set: change.restoreSet }
    : {}),
  ...(change.restoreClear?.length
    ? { clear: change.restoreClear }
    : {})
})

const applyRecordFieldWriteImpact = (
  impact: CommitImpact,
  change: AppliedDocumentRecordFieldWrite
) => {
  markTouchedRecord(impact, change.recordId)
  for (const fieldId of change.changedFields) {
    markValueTouched(impact, change.recordId, fieldId)
  }
}

const deletePatchedRecord = (
  impact: CommitImpact,
  recordId: RecordId
) => {
  impact.records?.patched?.delete(recordId)
  if (impact.values?.touched !== 'all') {
    impact.values?.touched?.delete(recordId)
  }
  if (impact.records?.touched !== 'all') {
    impact.records?.touched?.delete(recordId)
  }
}

const deleteFieldImpact = (
  impact: CommitImpact,
  fieldId: CustomFieldId
) => {
  impact.fields?.schema?.delete(fieldId)
  impact.fields?.schemaTouched?.delete(fieldId)
  if (impact.fields?.touched !== 'all') {
    impact.fields?.touched?.delete(fieldId)
  }
}

const clearTouchedView = (
  impact: CommitImpact,
  viewId: ViewId
) => {
  if (impact.views?.touched !== 'all') {
    impact.views?.touched?.delete(viewId)
  }
}

const deleteViewImpact = (
  impact: CommitImpact,
  viewId: ViewId
) => {
  impact.views?.changed?.delete(viewId)
}

const commitMutation = (
  runtime: DocumentOperationRuntime,
  document: DataDoc,
  inverse: readonly DocumentOperation[]
) => {
  runtime.replace(document)
  if (inverse.length) {
    runtime.inverse.prependMany(inverse)
  }
}

const applyRecordInsert = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.record.insert' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const nextDocument = documentApi.records.insert(document, operation.records, operation.target?.index)
  if (nextDocument === document) {
    return
  }

  const recordIds = collectInsertedRecordIds(operation.records)
  if (!recordIds.length) {
    return
  }

  const records = impact.records ?? (impact.records = {})
  recordIds.forEach(recordId => {
    if (records.removed?.delete(recordId)) {
      markTouchedRecord(impact, recordId)
      return
    }

    records.inserted = addSetValue(records.inserted, recordId)
    markTouchedRecord(impact, recordId)
  })

  commitMutation(runtime, nextDocument, [{
    type: 'document.record.remove',
    recordIds: [...recordIds]
  }])
}

const applyRecordPatch = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.record.patch' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const beforeRecord = documentApi.records.get(document, operation.recordId)
  if (!beforeRecord) {
    return
  }

  const nextDocument = documentApi.records.patch(document, operation.recordId, operation.patch)
  if (nextDocument === document) {
    return
  }

  const afterRecord = documentApi.records.get(nextDocument, operation.recordId)
  const aspects = commitImpact.record.patchAspects(beforeRecord, afterRecord)
  markRecordPatch(impact, operation.recordId, aspects)

  commitMutation(runtime, nextDocument, [{
    type: 'document.record.patch',
    recordId: operation.recordId,
    patch: Object.fromEntries(
      Object.keys(operation.patch).map(key => [key, json.readObjectKey(beforeRecord, key)])
    ) as Partial<Omit<DataRecord, 'id' | 'values'>>
  }])
}

const applyRecordRemove = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.record.remove' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const removedEntries = captureRecordEntries(document, operation.recordIds)
  if (!removedEntries.length) {
    return
  }

  const nextDocument = documentApi.records.remove(document, operation.recordIds)
  if (nextDocument === document) {
    return
  }

  const records = impact.records ?? (impact.records = {})
  removedEntries.forEach(entry => {
    if (records.inserted?.delete(entry.record.id)) {
      deletePatchedRecord(impact, entry.record.id)
      return
    }

    records.removed = addSetValue(records.removed, entry.record.id)
    markTouchedRecord(impact, entry.record.id)
  })

  commitMutation(runtime, nextDocument, removedEntries.map(entry => ({
    type: 'document.record.insert',
    records: [entry.record],
    target: {
      index: entry.index
    }
  })))
}

const applyRecordFieldWrite = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, {
    type:
      | 'document.record.fields.writeMany'
      | 'document.record.fields.restoreMany'
  }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const applied = operation.type === 'document.record.fields.writeMany'
    ? documentApi.records.writeFieldsWithChanges(document, operation)
    : documentApi.records.restoreFieldsWithChanges(document, operation.entries)

  if (applied.document === document) {
    return
  }

  const inverseEntries = applied.changes.map(change => {
    applyRecordFieldWriteImpact(impact, change)
    return createRecordFieldRestoreEntry(change)
  })

  commitMutation(
    runtime,
    applied.document,
    inverseEntries.length
      ? [{
          type: 'document.record.fields.restoreMany',
          entries: inverseEntries
        }]
      : []
  )
}

const applyFieldPut = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.field.put' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const beforeField = documentApi.schema.fields.get(document, operation.field.id)
  const nextDocument = documentApi.schema.fields.put(document, operation.field)
  const afterField = documentApi.schema.fields.get(nextDocument, operation.field.id)
  const aspects = commitImpact.field.schemaAspects(beforeField, afterField)

  if (!beforeField && !afterField) {
    return
  }

  if (beforeField && afterField && !aspects.length) {
    return
  }

  const fields = impact.fields ?? (impact.fields = {})
  if (!beforeField) {
    if (fields.removed?.delete(operation.field.id)) {
      markFieldSchema(impact, operation.field.id, ['all'])
    } else {
      fields.inserted = addSetValue(fields.inserted, operation.field.id)
      markFieldSchema(impact, operation.field.id, ['all'])
    }
  } else {
    markFieldSchema(impact, operation.field.id, aspects)
  }

  commitMutation(
    runtime,
    nextDocument,
    beforeField
      ? [{
          type: 'document.field.put',
          field: beforeField
        }]
      : [{
          type: 'document.field.remove',
          id: operation.field.id
        }]
  )
}

const applyFieldPatch = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.field.patch' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const beforeField = documentApi.schema.fields.get(document, operation.id)
  if (!beforeField) {
    return
  }

  const nextDocument = documentApi.schema.fields.patch(document, operation.id, operation.patch)
  if (nextDocument === document) {
    return
  }

  const afterField = documentApi.schema.fields.get(nextDocument, operation.id)
  markFieldSchema(
    impact,
    operation.id,
    commitImpact.field.schemaAspects(beforeField, afterField)
  )

  commitMutation(runtime, nextDocument, [{
    type: 'document.field.patch',
    id: operation.id,
    patch: Object.fromEntries(
      Object.keys(operation.patch).map(key => [key, json.readObjectKey(beforeField, key)])
    ) as Partial<Omit<CustomField, 'id'>>
  }])
}

const applyFieldRemove = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.field.remove' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const beforeField = documentApi.schema.fields.get(document, operation.id)
  if (!beforeField) {
    return
  }

  const nextDocument = documentApi.schema.fields.remove(document, operation.id)
  if (nextDocument === document) {
    return
  }

  const fields = impact.fields ?? (impact.fields = {})
  if (fields.inserted?.delete(operation.id)) {
    deleteFieldImpact(impact, operation.id)
  } else {
    fields.removed = addSetValue(fields.removed, operation.id)
    markFieldSchema(impact, operation.id, ['all'])
  }

  commitMutation(runtime, nextDocument, [{
    type: 'document.field.put',
    field: beforeField
  }])
}

const applyViewPut = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.view.put' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const beforeView = documentApi.views.get(document, operation.view.id)
  const nextDocument = documentApi.views.put(document, operation.view)
  const afterView = documentApi.views.get(nextDocument, operation.view.id)
  const beforeActiveViewId = documentApi.views.activeId.get(document)
  const afterActiveViewId = documentApi.views.activeId.get(nextDocument)

  if (!afterView) {
    return
  }

  const queryAspects = beforeView
    ? commitImpact.view.queryAspects(beforeView, afterView)
    : []
  const layoutAspects = beforeView
    ? commitImpact.view.layoutAspects(beforeView, afterView)
    : []
  const calculationFields = beforeView
    ? commitImpact.view.calculationFields(beforeView, afterView)
    : undefined

  if (
    beforeView
    && !queryAspects.length
    && !layoutAspects.length
    && !calculationFields?.length
    && beforeActiveViewId === afterActiveViewId
    && equal.sameJsonValue(beforeView, afterView)
  ) {
    return
  }

  const views = impact.views ?? (impact.views = {})
  if (!beforeView) {
    if (views.removed?.delete(operation.view.id)) {
      const change = ensureViewChange(impact, operation.view.id)
      markTouchedView(impact, operation.view.id)
      change.queryAspects = addSetValues(change.queryAspects, ['search', 'filter', 'sort', 'group', 'order'])
      change.layoutAspects = addSetValues(change.layoutAspects, ['name', 'type', 'display', 'options'])
      change.calculationFields = 'all'
    } else {
      views.inserted = addSetValue(views.inserted, operation.view.id)
      markTouchedView(impact, operation.view.id)
    }
  } else {
    markViewQuery(impact, operation.view.id, queryAspects)
    markViewLayout(impact, operation.view.id, layoutAspects)
    markViewCalculations(impact, operation.view.id, calculationFields)
  }

  mergeActiveViewImpact(impact, beforeActiveViewId, afterActiveViewId)

  commitMutation(
    runtime,
    nextDocument,
    beforeView
      ? [{
          type: 'document.view.put',
          view: beforeView
        }]
      : [{
          type: 'document.view.remove',
          id: operation.view.id
        }]
  )
}

const applyActiveViewSet = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.activeView.set' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const beforeViewId = documentApi.views.activeId.get(document)
  const nextDocument = documentApi.views.activeId.set(document, operation.id)
  const afterViewId = documentApi.views.activeId.get(nextDocument)
  if (beforeViewId === afterViewId) {
    return
  }

  mergeActiveViewImpact(impact, beforeViewId, afterViewId)
  commitMutation(runtime, nextDocument, [{
    type: 'document.activeView.set',
    id: beforeViewId
  }])
}

const applyViewRemove = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'document.view.remove' }>,
  impact: CommitImpact
): void => {
  const document = runtime.doc()
  const beforeView = documentApi.views.get(document, operation.id)
  if (!beforeView) {
    return
  }

  const beforeActiveViewId = documentApi.views.activeId.get(document)
  const nextDocument = documentApi.views.remove(document, operation.id)
  const afterActiveViewId = documentApi.views.activeId.get(nextDocument)

  const views = impact.views ?? (impact.views = {})
  if (views.inserted?.delete(operation.id)) {
    deleteViewImpact(impact, operation.id)
    clearTouchedView(impact, operation.id)
  } else {
    views.removed = addSetValue(views.removed, operation.id)
    markTouchedView(impact, operation.id)
    deleteViewImpact(impact, operation.id)
  }

  mergeActiveViewImpact(impact, beforeActiveViewId, afterActiveViewId)

  commitMutation(runtime, nextDocument, [{
    type: 'document.view.put',
    view: beforeView
  }])
}

const applyExternalBump = (
  runtime: DocumentOperationRuntime,
  operation: Extract<DocumentOperation, { type: 'external.version.bump' }>,
  impact: CommitImpact
): void => {
  impact.external = {
    versionBumped: true,
    source: operation.source
  }

  runtime.inverse.prependMany([{
    type: 'external.version.bump',
    source: operation.source
  }])
}

export const applyOperationMutation = (
  runtime: DocumentOperationRuntime,
  operation: DocumentOperation,
  impact: CommitImpact
): void => {
  switch (operation.type) {
    case 'document.record.insert':
      return applyRecordInsert(runtime, operation, impact)
    case 'document.record.patch':
      return applyRecordPatch(runtime, operation, impact)
    case 'document.record.remove':
      return applyRecordRemove(runtime, operation, impact)
    case 'document.record.fields.writeMany':
    case 'document.record.fields.restoreMany':
      return applyRecordFieldWrite(runtime, operation, impact)
    case 'document.field.put':
      return applyFieldPut(runtime, operation, impact)
    case 'document.field.patch':
      return applyFieldPatch(runtime, operation, impact)
    case 'document.field.remove':
      return applyFieldRemove(runtime, operation, impact)
    case 'document.view.put':
      return applyViewPut(runtime, operation, impact)
    case 'document.activeView.set':
      return applyActiveViewSet(runtime, operation, impact)
    case 'document.view.remove':
      return applyViewRemove(runtime, operation, impact)
    case 'external.version.bump':
      return applyExternalBump(runtime, operation, impact)
  }
}
