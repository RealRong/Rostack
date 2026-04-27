import type {
  CommitImpact,
  CommitImpactViewChange,
  FieldSchemaAspect,
  RecordPatchAspect,
  ViewLayoutAspect,
  ViewQueryAspect
} from '@dataview/core/types/commit'
import type {
  DocumentOperation,
  DocumentRecordFieldRestoreEntry
} from '@dataview/core/types/operations'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types/state'
import {
  impact as commitImpact
} from '@dataview/core/operations/internal/impact'
import {
  type AppliedDocumentRecordFieldWrite,
} from '@dataview/core/document'
import {
  documentRecords
} from '@dataview/core/document/records'
import type {
  DocumentMutationContext,
  DocumentMutationFootprintContext,
  DocumentMutationOperationContext
} from '@dataview/core/operations/internal/context'
import {
  applyRecordFieldWriteInputToDraft,
  restoreRecordFieldsToDraft
} from '@dataview/core/operations/internal/recordFieldDraft'
import { entityTable as sharedEntityTable, equal, json } from '@shared/core'

type DocumentOperationType = DocumentOperation['type']
type DocumentOperationFamily =
  | 'record'
  | 'field'
  | 'view'
  | 'external'
type DocumentOperationSync =
  | 'live'
  | 'checkpoint'

type DocumentOperationByType<TType extends DocumentOperationType> = Extract<
  DocumentOperation,
  { type: TType }
>

export interface DocumentOperationDefinition<
  TType extends DocumentOperationType = DocumentOperationType
> {
  family: DocumentOperationFamily
  sync?: DocumentOperationSync
  history?: boolean
  footprint?(
    ctx: DocumentMutationOperationContext,
    op: DocumentOperationByType<TType>
  ): void
  apply(
    ctx: DocumentMutationOperationContext,
    op: DocumentOperationByType<TType>
  ): void
}

type DocumentOperationDefinitionTable = {
  [TType in DocumentOperationType]: DocumentOperationDefinition<TType>
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
): readonly RecordId[] => sharedEntityTable.normalize.list(records).ids

const captureRecordEntries = (
  document: DataDoc,
  recordIds: readonly RecordId[]
) => recordIds
  .map(recordId => {
    const record = documentRecords.get(document, recordId)
    const index = documentRecords.indexOf(document, recordId)
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
  ctx: DocumentMutationContext,
  inverse: readonly DocumentOperation[]
) => {
  if (inverse.length) {
    ctx.inverse.prependMany(inverse)
  }
}

const resolveActiveViewId = (
  input: {
    ids: readonly ViewId[]
    has(id: ViewId): boolean
  },
  preferredViewId?: ViewId
): ViewId | undefined => {
  if (preferredViewId && input.has(preferredViewId)) {
    return preferredViewId
  }

  for (const viewId of input.ids) {
    if (input.has(viewId)) {
      return viewId
    }
  }

  return undefined
}

const addRecordValueKey = (
  input: {
    recordId: RecordId
    fieldId: FieldId
  },
  ctx: DocumentMutationFootprintContext
) => {
  ctx.footprint(`records.${input.recordId}.values.${input.fieldId}`)
  ctx.footprint(`fields.${input.fieldId}.values.${input.recordId}`)
}

const addRecordValueKeys = (
  input: {
    recordIds: readonly RecordId[]
    set?: Partial<Record<FieldId, unknown>>
    clear?: readonly FieldId[]
  },
  ctx: DocumentMutationFootprintContext
) => {
  input.recordIds.forEach((recordId) => {
    Object.keys(input.set ?? {}).forEach((fieldId) => {
      addRecordValueKey({
        recordId,
        fieldId: fieldId as FieldId
      }, ctx)
    })
    ;(input.clear ?? []).forEach((fieldId) => {
      addRecordValueKey({
        recordId,
        fieldId
      }, ctx)
    })
  })
}

const applyRecordInsert = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.record.insert' }>
): void => {
  const impact = ctx.trace
  const nextRecords = sharedEntityTable.normalize.list(operation.records)
  const recordIds = collectInsertedRecordIds(operation.records)
  if (!recordIds.length) {
    return
  }

  const currentIds = ctx.draft.records.ids.current()
  const insertedIdSet = new Set(recordIds)
  const remainingIds = currentIds.filter((recordId) => !insertedIdSet.has(recordId))
  const safeIndex = Math.max(0, Math.min(operation.target?.index ?? remainingIds.length, remainingIds.length))
  const nextIds = [
    ...remainingIds.slice(0, safeIndex),
    ...recordIds,
    ...remainingIds.slice(safeIndex)
  ]
  const idsChanged = nextIds.length !== currentIds.length
    || nextIds.some((recordId, index) => currentIds[index] !== recordId)
  const valuesChanged = recordIds.some((recordId) => {
    const nextRecord = nextRecords.byId[recordId]
    return nextRecord !== undefined && !Object.is(ctx.draft.records.get(recordId), nextRecord)
  })
  if (!idsChanged && !valuesChanged) {
    return
  }

  recordIds.forEach((recordId) => {
    const record = nextRecords.byId[recordId]
    if (record) {
      ctx.draft.records.byId.set(recordId, record)
    }
  })
  if (idsChanged) {
    ctx.draft.records.ids.set(nextIds)
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

  commitMutation(ctx, [{
    type: 'document.record.remove',
    recordIds: [...recordIds]
  }])
}

const applyRecordPatch = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.record.patch' }>
): void => {
  const impact = ctx.trace
  const beforeRecord = ctx.draft.records.get(operation.recordId)
  if (!beforeRecord) {
    return
  }

  const afterRecord = sharedEntityTable.patch.merge(
    beforeRecord,
    operation.patch as Partial<DataRecord>
  ) as DataRecord
  if (afterRecord === beforeRecord) {
    return
  }

  ctx.draft.records.byId.set(operation.recordId, afterRecord)
  const aspects = commitImpact.record.patchAspects(beforeRecord, afterRecord)
  markRecordPatch(impact, operation.recordId, aspects)

  commitMutation(ctx, [{
    type: 'document.record.patch',
    recordId: operation.recordId,
    patch: Object.fromEntries(
      Object.keys(operation.patch).map(key => [key, json.readObjectKey(beforeRecord, key)])
    ) as Partial<Omit<DataRecord, 'id' | 'values'>>
  }])
}

const applyRecordRemove = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.record.remove' }>
): void => {
  const impact = ctx.trace
  const removedEntries = captureRecordEntries(ctx.doc(), operation.recordIds)
  if (!removedEntries.length) {
    return
  }
  removedEntries.forEach((entry) => {
    ctx.draft.records.remove(entry.record.id)
  })

  const records = impact.records ?? (impact.records = {})
  removedEntries.forEach(entry => {
    if (records.inserted?.delete(entry.record.id)) {
      deletePatchedRecord(impact, entry.record.id)
      return
    }

    records.removed = addSetValue(records.removed, entry.record.id)
    markTouchedRecord(impact, entry.record.id)
  })

  commitMutation(ctx, removedEntries.map(entry => ({
    type: 'document.record.insert',
    records: [entry.record],
    target: {
      index: entry.index
    }
  })))
}

const applyRecordFieldWrite = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, {
    type:
      | 'document.record.fields.writeMany'
      | 'document.record.fields.restoreMany'
  }>
): void => {
  const impact = ctx.trace
  const changes = operation.type === 'document.record.fields.writeMany'
    ? applyRecordFieldWriteInputToDraft(ctx.draft.records, operation)
    : restoreRecordFieldsToDraft(ctx.draft.records, operation.entries)

  if (!changes.length) {
    return
  }

  const inverseEntries = changes.map(change => {
    applyRecordFieldWriteImpact(impact, change)
    return createRecordFieldRestoreEntry(change)
  })

  commitMutation(
    ctx,
    inverseEntries.length
      ? [{
          type: 'document.record.fields.restoreMany',
          entries: inverseEntries
        }]
      : []
  )
}

const applyFieldPut = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.field.put' }>
): void => {
  const impact = ctx.trace
  const beforeField = ctx.draft.fields.get(operation.field.id)
  const afterField = operation.field
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

  ctx.draft.fields.put(afterField)
  commitMutation(
    ctx,
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
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.field.patch' }>
): void => {
  const impact = ctx.trace
  const beforeField = ctx.draft.fields.get(operation.id)
  if (!beforeField) {
    return
  }

  const afterField = sharedEntityTable.patch.merge(
    beforeField,
    operation.patch as Partial<CustomField>
  ) as CustomField
  if (afterField === beforeField) {
    return
  }

  ctx.draft.fields.byId.set(operation.id, afterField)
  markFieldSchema(
    impact,
    operation.id,
    commitImpact.field.schemaAspects(beforeField, afterField)
  )

  commitMutation(ctx, [{
    type: 'document.field.patch',
    id: operation.id,
    patch: Object.fromEntries(
      Object.keys(operation.patch).map(key => [key, json.readObjectKey(beforeField, key)])
    ) as Partial<Omit<CustomField, 'id'>>
  }])
}

const applyFieldRemove = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.field.remove' }>
): void => {
  const impact = ctx.trace
  const beforeField = ctx.draft.fields.remove(operation.id)
  if (!beforeField) {
    return
  }

  const fields = impact.fields ?? (impact.fields = {})
  if (fields.inserted?.delete(operation.id)) {
    deleteFieldImpact(impact, operation.id)
  } else {
    fields.removed = addSetValue(fields.removed, operation.id)
    markFieldSchema(impact, operation.id, ['all'])
  }

  commitMutation(ctx, [{
    type: 'document.field.put',
    field: beforeField
  }])
}

const applyViewPut = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.view.put' }>
): void => {
  const impact = ctx.trace
  const beforeView = ctx.draft.views.get(operation.view.id)
  const afterView = operation.view
  const beforeActiveViewId = ctx.draft.activeViewId.current()
  const afterActiveViewId = resolveActiveViewId({
    ids: beforeView
      ? ctx.draft.views.ids.current()
      : [...ctx.draft.views.ids.current(), operation.view.id],
    has: (viewId) => (
      viewId === operation.view.id
        ? true
        : ctx.draft.views.has(viewId)
    )
  }, beforeActiveViewId ?? operation.view.id)

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

  if (beforeView) {
    ctx.draft.views.byId.set(operation.view.id, afterView)
  } else {
    ctx.draft.views.put(afterView)
  }
  if (beforeActiveViewId !== afterActiveViewId) {
    ctx.draft.activeViewId.set(afterActiveViewId)
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
    ctx,
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
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.activeView.set' }>
): void => {
  const impact = ctx.trace
  const beforeViewId = ctx.draft.activeViewId.current()
  const afterViewId = resolveActiveViewId({
    ids: ctx.draft.views.ids.current(),
    has: (viewId) => ctx.draft.views.has(viewId)
  }, operation.id)
  if (beforeViewId === afterViewId) {
    return
  }

  ctx.draft.activeViewId.set(afterViewId)
  mergeActiveViewImpact(impact, beforeViewId, afterViewId)
  commitMutation(ctx, [{
    type: 'document.activeView.set',
    id: beforeViewId
  }])
}

const applyViewRemove = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'document.view.remove' }>
): void => {
  const impact = ctx.trace
  const beforeView = ctx.draft.views.get(operation.id)
  if (!beforeView) {
    return
  }

  const beforeActiveViewId = ctx.draft.activeViewId.current()
  const afterActiveViewId = resolveActiveViewId({
    ids: ctx.draft.views.ids.current().filter((viewId) => viewId !== operation.id),
    has: (viewId) => viewId !== operation.id && ctx.draft.views.has(viewId)
  }, beforeActiveViewId === operation.id ? undefined : beforeActiveViewId)

  const views = impact.views ?? (impact.views = {})
  if (views.inserted?.delete(operation.id)) {
    deleteViewImpact(impact, operation.id)
    clearTouchedView(impact, operation.id)
  } else {
    views.removed = addSetValue(views.removed, operation.id)
    markTouchedView(impact, operation.id)
    deleteViewImpact(impact, operation.id)
  }

  ctx.draft.views.remove(operation.id)
  if (beforeActiveViewId !== afterActiveViewId) {
    ctx.draft.activeViewId.set(afterActiveViewId)
  }
  mergeActiveViewImpact(impact, beforeActiveViewId, afterActiveViewId)

  commitMutation(ctx, [{
    type: 'document.view.put',
    view: beforeView
  }])
}

const applyExternalBump = (
  ctx: DocumentMutationContext,
  operation: Extract<DocumentOperation, { type: 'external.version.bump' }>
): void => {
  ctx.trace.external = {
    versionBumped: true,
    source: operation.source
  }

  ctx.inverse.prependMany([{
    type: 'external.version.bump',
    source: operation.source
  }])
}

const definitions: DocumentOperationDefinitionTable = {
  'document.record.insert': {
    family: 'record',
    footprint: (ctx, operation) => {
      ctx.footprint('records')
      operation.records.forEach((record) => {
        ctx.footprint(`records.${record.id}`)
        Object.keys(record.values).forEach((fieldId) => {
          addRecordValueKey({
            recordId: record.id,
            fieldId: fieldId as FieldId
          }, ctx)
        })
      })
    },
    apply: applyRecordInsert
  },
  'document.record.patch': {
    family: 'record',
    footprint: (ctx, operation) => {
      ctx.footprint(`records.${operation.recordId}`)
    },
    apply: applyRecordPatch
  },
  'document.record.remove': {
    family: 'record',
    footprint: (ctx, operation) => {
      ctx.footprint('records')
      operation.recordIds.forEach((recordId) => {
        ctx.footprint(`records.${recordId}`)
      })
    },
    apply: applyRecordRemove
  },
  'document.record.fields.writeMany': {
    family: 'record',
    footprint: (ctx, operation) => {
      addRecordValueKeys(operation, ctx)
    },
    apply: applyRecordFieldWrite
  },
  'document.record.fields.restoreMany': {
    family: 'record',
    footprint: (ctx, operation) => {
      operation.entries.forEach((entry) => {
        addRecordValueKeys({
          recordIds: [entry.recordId],
          set: entry.set,
          clear: entry.clear
        }, ctx)
      })
    },
    apply: applyRecordFieldWrite
  },
  'document.field.put': {
    family: 'field',
    footprint: (ctx, operation) => {
      const existed = Boolean(ctx.doc().fields.byId[operation.field.id])
      if (!existed) {
        ctx.footprint('fields')
      }
      ctx.footprint(`fields.${operation.field.id}`)
    },
    apply: applyFieldPut
  },
  'document.field.patch': {
    family: 'field',
    footprint: (ctx, operation) => {
      ctx.footprint(`fields.${operation.id}`)
    },
    apply: applyFieldPatch
  },
  'document.field.remove': {
    family: 'field',
    footprint: (ctx, operation) => {
      ctx.footprint('fields')
      ctx.footprint(`fields.${operation.id}`)
    },
    apply: applyFieldRemove
  },
  'document.view.put': {
    family: 'view',
    footprint: (ctx, operation) => {
      const existed = Boolean(ctx.doc().views.byId[operation.view.id])
      if (!existed) {
        ctx.footprint('views')
      }
      ctx.footprint(`views.${operation.view.id}`)
    },
    apply: applyViewPut
  },
  'document.activeView.set': {
    family: 'view',
    footprint: (ctx) => {
      ctx.footprint('activeView')
    },
    apply: applyActiveViewSet
  },
  'document.view.remove': {
    family: 'view',
    footprint: (ctx, operation) => {
      ctx.footprint('views')
      ctx.footprint(`views.${operation.id}`)
    },
    apply: applyViewRemove
  },
  'external.version.bump': {
    family: 'external',
    history: false,
    footprint: (ctx, operation) => {
      ctx.footprint(`external.${operation.source}`)
    },
    apply: applyExternalBump
  }
}

const typeOfOperation = <TType extends DocumentOperationType>(
  input: TType | DocumentOperationByType<TType>
): TType => (
  typeof input === 'string'
    ? input
    : input.type
)

export const DATAVIEW_OPERATION_DEFINITIONS = Object.freeze(definitions)

export const readDataviewOperationDefinition = <
  TType extends DocumentOperationType
>(
  input: TType | DocumentOperationByType<TType>
): DocumentOperationDefinition<TType> => (
  DATAVIEW_OPERATION_DEFINITIONS[typeOfOperation(input)] as DocumentOperationDefinition<TType>
)

export const collectDataviewOperationFootprint = (
  ctx: DocumentMutationOperationContext,
  operation: DocumentOperation
) => {
  readDataviewOperationDefinition(operation).footprint?.(
    ctx,
    operation as never
  )
}

export const applyDataviewOperation = (
  ctx: DocumentMutationOperationContext,
  operation: DocumentOperation
) => {
  readDataviewOperationDefinition(operation).apply(
    ctx,
    operation as never
  )
}
