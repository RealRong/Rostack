import type {
  CommitImpact,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  hasDocumentField
} from '@dataview/core/document'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  hasRecordSetChange
} from '@dataview/engine/active/index/shared'
import type { FieldSyncContext } from '@dataview/engine/active/index/contracts'

export const createFieldSyncContext = (
  impact: CommitImpact,
  options?: {
    includeTitlePatch?: boolean
    includeRecordSetChange?: boolean
  }
): FieldSyncContext => ({
  schemaFields: collectSchemaFieldIds(impact),
  valueFields: collectValueFieldIds(impact, {
    includeTitlePatch: options?.includeTitlePatch
  }),
  touchedRecords: collectTouchedRecordIds(impact),
  recordSetChanged: options?.includeRecordSetChange === true
    ? hasRecordSetChange(impact)
    : false
})

export const ensureFieldIndexes = <T>(input: {
  previous: ReadonlyMap<FieldId, T>
  document: DataDoc
  fieldIds: readonly FieldId[]
  build: (fieldId: FieldId) => T
}): {
  fields: Map<FieldId, T>
  changed: boolean
} => {
  let changed = false
  const fields = new Map(input.previous)

  input.fieldIds.forEach(fieldId => {
    if (fields.has(fieldId) || !hasDocumentField(input.document, fieldId)) {
      return
    }

    fields.set(fieldId, input.build(fieldId))
    changed = true
  })

  return {
    fields,
    changed
  }
}

export const shouldDropFieldIndex = (
  document: DataDoc,
  context: FieldSyncContext,
  fieldId: FieldId
): boolean => context.schemaFields.has(fieldId)
  && !hasDocumentField(document, fieldId)

export const shouldRebuildFieldIndex = (
  context: FieldSyncContext,
  fieldId: FieldId
): boolean => context.schemaFields.has(fieldId)
  || context.touchedRecords === 'all'

export const shouldSyncFieldIndex = (
  context: FieldSyncContext,
  fieldId: FieldId
): context is FieldSyncContext & { touchedRecords: ReadonlySet<RecordId> } => (
  context.touchedRecords !== 'all'
  && context.touchedRecords.size > 0
  && (
    context.valueFields === 'all'
    || context.valueFields.has(fieldId)
    || context.recordSetChanged
  )
)
