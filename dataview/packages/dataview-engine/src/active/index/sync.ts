import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import { createMapDraft as createMapPatchBuilder } from '@shared/draft'
import type { FieldSyncContext } from '@dataview/engine/active/index/contracts'

export const ensureFieldIndexes = <T>(input: {
  previous: ReadonlyMap<FieldId, T>
  hasField: (fieldId: FieldId) => boolean
  fieldIds: readonly FieldId[]
  build: (fieldId: FieldId) => T
}): {
  fields: ReadonlyMap<FieldId, T>
  changed: boolean
} => {
  const fields = createMapPatchBuilder(input.previous)

  input.fieldIds.forEach(fieldId => {
    if (fields.has(fieldId) || !input.hasField(fieldId)) {
      return
    }

    fields.set(fieldId, input.build(fieldId))
  })

  return {
    fields: fields.finish(),
    changed: fields.changed()
  }
}

export const shouldDropFieldIndex = (
  hasField: (fieldId: FieldId) => boolean,
  context: FieldSyncContext,
  fieldId: FieldId
): boolean => !hasField(fieldId)
  && (
    context.schemaFields.has(fieldId)
    || context.touchedRecords === 'all'
  )

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
