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
import {
  sameJsonValue
} from '@shared/core'

export interface ExecuteOperationResult {
  document: DataDoc
  inverse: readonly DocumentOperation[]
}

const hasOwn = (
  value: Record<string, unknown>,
  key: string
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const readObjectValue = (
  value: unknown,
  key: string
): unknown => (value as Record<string, unknown>)[key]

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

const markTitleChanged = (
  impact: CommitImpact,
  recordId: RecordId
) => {
  const records = impact.records ?? (impact.records = {})
  records.titleChanged = addSetValue(records.titleChanged, recordId)
  const fields = impact.fields ?? (impact.fields = {})
  if (fields.touched !== 'all') {
    fields.touched = addSetValue(fields.touched as Set<FieldId> | undefined, TITLE_FIELD_ID)
  }
}

const markValueFieldChanged = (
  impact: CommitImpact,
  fieldId: FieldId
) => {
  if (impact.records?.valueChangedFields === 'all') {
    return
  }

  const records = impact.records ?? (impact.records = {})
  records.valueChangedFields = addSetValue(records.valueChangedFields as Set<FieldId> | undefined, fieldId)
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
      markTitleChanged(impact, recordId)
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

const trackActiveViewChange = (
  impact: CommitImpact,
  beforeDocument: DataDoc,
  afterDocument: DataDoc
) => mergeActiveViewImpact(
  impact,
  documentApi.views.activeId.get(beforeDocument),
  documentApi.views.activeId.get(afterDocument)
)

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
    if (fieldId === TITLE_FIELD_ID) {
      markTitleChanged(impact, change.recordId)
      continue
    }
    markValueFieldChanged(impact, fieldId)
  }
}

const deletePatchedRecord = (
  impact: CommitImpact,
  recordId: RecordId
) => {
  impact.records?.patched?.delete(recordId)
  impact.records?.titleChanged?.delete(recordId)
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

const executeRecordInsert = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.record.insert' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const nextDocument = documentApi.records.insert(document, operation.records, operation.target?.index)
  if (nextDocument === document) {
    return {
      document,
      inverse: []
    }
  }

  const recordIds = collectInsertedRecordIds(operation.records)
  if (!recordIds.length) {
    return {
      document,
      inverse: []
    }
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

  return {
    document: nextDocument,
    inverse: [{
      type: 'document.record.remove',
      recordIds: [...recordIds]
    }]
  }
}

const executeRecordPatch = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.record.patch' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const beforeRecord = documentApi.records.get(document, operation.recordId)
  if (!beforeRecord) {
    return {
      document,
      inverse: []
    }
  }

  const nextDocument = documentApi.records.patch(document, operation.recordId, operation.patch)
  if (nextDocument === document) {
    return {
      document,
      inverse: []
    }
  }

  const afterRecord = documentApi.records.get(nextDocument, operation.recordId)
  const aspects = commitImpact.record.patchAspects(beforeRecord, afterRecord)
  markRecordPatch(impact, operation.recordId, aspects)

  return {
    document: nextDocument,
    inverse: [{
      type: 'document.record.patch',
      recordId: operation.recordId,
      patch: Object.fromEntries(
        Object.keys(operation.patch).map(key => [key, readObjectValue(beforeRecord, key)])
      ) as Partial<Omit<DataRecord, 'id' | 'values'>>
    }]
  }
}

const executeRecordRemove = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.record.remove' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const removedEntries = captureRecordEntries(document, operation.recordIds)
  if (!removedEntries.length) {
    return {
      document,
      inverse: []
    }
  }

  const nextDocument = documentApi.records.remove(document, operation.recordIds)
  if (nextDocument === document) {
    return {
      document,
      inverse: []
    }
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

  return {
    document: nextDocument,
    inverse: removedEntries.map(entry => ({
      type: 'document.record.insert',
      records: [entry.record],
      target: {
        index: entry.index
      }
    }))
  }
}

const executeRecordFieldWrite = (
  document: DataDoc,
  operation: Extract<DocumentOperation, {
    type:
      | 'document.record.fields.writeMany'
      | 'document.record.fields.restoreMany'
  }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const applied = operation.type === 'document.record.fields.writeMany'
    ? documentApi.records.writeFieldsWithChanges(document, operation)
    : documentApi.records.restoreFieldsWithChanges(document, operation.entries)

  if (applied.document === document) {
    return {
      document,
      inverse: []
    }
  }

  const inverseEntries = applied.changes.map(change => {
    applyRecordFieldWriteImpact(impact, change)
    return createRecordFieldRestoreEntry(change)
  })

  return {
    document: applied.document,
    inverse: inverseEntries.length
      ? [{
          type: 'document.record.fields.restoreMany',
          entries: inverseEntries
        }]
      : []
  }
}

const executeFieldPut = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.field.put' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const beforeField = documentApi.fields.custom.get(document, operation.field.id)
  const nextDocument = documentApi.fields.custom.put(document, operation.field)
  const afterField = documentApi.fields.custom.get(nextDocument, operation.field.id)
  const aspects = commitImpact.field.schemaAspects(beforeField, afterField)

  if (!beforeField && !afterField) {
    return {
      document,
      inverse: []
    }
  }

  if (beforeField && afterField && !aspects.length) {
    return {
      document,
      inverse: []
    }
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

  return {
    document: nextDocument,
    inverse: beforeField
      ? [{
          type: 'document.field.put',
          field: beforeField
        }]
      : [{
          type: 'document.field.remove',
          fieldId: operation.field.id
        }]
  }
}

const executeFieldPatch = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.field.patch' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const beforeField = documentApi.fields.custom.get(document, operation.fieldId)
  if (!beforeField) {
    return {
      document,
      inverse: []
    }
  }

  const nextDocument = documentApi.fields.custom.patch(document, operation.fieldId, operation.patch)
  if (nextDocument === document) {
    return {
      document,
      inverse: []
    }
  }

  const afterField = documentApi.fields.custom.get(nextDocument, operation.fieldId)
  markFieldSchema(
    impact,
    operation.fieldId,
    commitImpact.field.schemaAspects(beforeField, afterField)
  )

  return {
    document: nextDocument,
    inverse: [{
      type: 'document.field.patch',
      fieldId: operation.fieldId,
      patch: Object.fromEntries(
        Object.keys(operation.patch).map(key => [key, readObjectValue(beforeField, key)])
      ) as Partial<Omit<CustomField, 'id'>>
    }]
  }
}

const executeFieldRemove = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.field.remove' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const beforeField = documentApi.fields.custom.get(document, operation.fieldId)
  if (!beforeField) {
    return {
      document,
      inverse: []
    }
  }

  const nextDocument = documentApi.fields.custom.remove(document, operation.fieldId)
  if (nextDocument === document) {
    return {
      document,
      inverse: []
    }
  }

  const fields = impact.fields ?? (impact.fields = {})
  if (fields.inserted?.delete(operation.fieldId)) {
    deleteFieldImpact(impact, operation.fieldId)
  } else {
    fields.removed = addSetValue(fields.removed, operation.fieldId)
    markFieldSchema(impact, operation.fieldId, ['all'])
  }

  return {
    document: nextDocument,
    inverse: [{
      type: 'document.field.put',
      field: beforeField
    }]
  }
}

const executeViewPut = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.view.put' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const beforeView = documentApi.views.get(document, operation.view.id)
  const nextDocument = documentApi.views.put(document, operation.view)
  const afterView = documentApi.views.get(nextDocument, operation.view.id)
  const beforeActiveViewId = documentApi.views.activeId.get(document)
  const afterActiveViewId = documentApi.views.activeId.get(nextDocument)

  if (!afterView) {
    return {
      document,
      inverse: []
    }
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
    && sameJsonValue(beforeView, afterView)
  ) {
    return {
      document,
      inverse: []
    }
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

  return {
    document: nextDocument,
    inverse: beforeView
      ? [{
          type: 'document.view.put',
          view: beforeView
        }]
      : [{
          type: 'document.view.remove',
          viewId: operation.view.id
        }]
  }
}

const executeActiveViewSet = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.activeView.set' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const beforeViewId = documentApi.views.activeId.get(document)
  const nextDocument = documentApi.views.activeId.set(document, operation.viewId)
  const afterViewId = documentApi.views.activeId.get(nextDocument)
  if (beforeViewId === afterViewId) {
    return {
      document,
      inverse: []
    }
  }

  mergeActiveViewImpact(impact, beforeViewId, afterViewId)
  return {
    document: nextDocument,
    inverse: [{
      type: 'document.activeView.set',
      viewId: beforeViewId
    }]
  }
}

const executeViewRemove = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'document.view.remove' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  const beforeView = documentApi.views.get(document, operation.viewId)
  if (!beforeView) {
    return {
      document,
      inverse: []
    }
  }

  const beforeActiveViewId = documentApi.views.activeId.get(document)
  const nextDocument = documentApi.views.remove(document, operation.viewId)
  const afterActiveViewId = documentApi.views.activeId.get(nextDocument)

  const views = impact.views ?? (impact.views = {})
  if (views.inserted?.delete(operation.viewId)) {
    deleteViewImpact(impact, operation.viewId)
    clearTouchedView(impact, operation.viewId)
  } else {
    views.removed = addSetValue(views.removed, operation.viewId)
    markTouchedView(impact, operation.viewId)
    deleteViewImpact(impact, operation.viewId)
  }

  mergeActiveViewImpact(impact, beforeActiveViewId, afterActiveViewId)

  return {
    document: nextDocument,
    inverse: [{
      type: 'document.view.put',
      view: beforeView
    }]
  }
}

const executeExternalBump = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'external.version.bump' }>,
  impact: CommitImpact
): ExecuteOperationResult => {
  impact.external = {
    versionBumped: true,
    source: operation.source
  }

  return {
    document,
    inverse: [{
      type: 'external.version.bump',
      source: operation.source
    }]
  }
}

export const executeOperation = (
  document: DataDoc,
  operation: DocumentOperation,
  impact: CommitImpact
): ExecuteOperationResult => {
  switch (operation.type) {
    case 'document.record.insert':
      return executeRecordInsert(document, operation, impact)
    case 'document.record.patch':
      return executeRecordPatch(document, operation, impact)
    case 'document.record.remove':
      return executeRecordRemove(document, operation, impact)
    case 'document.record.fields.writeMany':
    case 'document.record.fields.restoreMany':
      return executeRecordFieldWrite(document, operation, impact)
    case 'document.field.put':
      return executeFieldPut(document, operation, impact)
    case 'document.field.patch':
      return executeFieldPatch(document, operation, impact)
    case 'document.field.remove':
      return executeFieldRemove(document, operation, impact)
    case 'document.view.put':
      return executeViewPut(document, operation, impact)
    case 'document.activeView.set':
      return executeActiveViewSet(document, operation, impact)
    case 'document.view.remove':
      return executeViewRemove(document, operation, impact)
    case 'external.version.bump':
      return executeExternalBump(document, operation, impact)
  }
}
