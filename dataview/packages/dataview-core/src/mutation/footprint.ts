import type {
  Path
} from '@shared/mutation'
import type {
  ReducerContext
} from '@shared/reducer'
import {
  path as mutationPath
} from '@shared/mutation'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'

export type DataviewMutationKey = Path

const key = {
  recordsOrder: (): DataviewMutationKey => mutationPath.of('records', 'order'),
  record: (recordId: RecordId): DataviewMutationKey => mutationPath.of('records', recordId),
  recordField: (recordId: RecordId, fieldId: FieldId): DataviewMutationKey => mutationPath.of('records', recordId, 'values', fieldId),
  fieldValues: (fieldId: FieldId, recordId: RecordId): DataviewMutationKey => mutationPath.of('fields', fieldId, 'values', recordId),
  fieldsOrder: (): DataviewMutationKey => mutationPath.of('fields', 'order'),
  field: (fieldId: FieldId): DataviewMutationKey => mutationPath.of('fields', fieldId),
  viewsOrder: (): DataviewMutationKey => mutationPath.of('views', 'order'),
  view: (viewId: string): DataviewMutationKey => mutationPath.of('views', viewId),
  activeView: (): DataviewMutationKey => mutationPath.of('activeView'),
  external: (source: string): DataviewMutationKey => mutationPath.of('external', source)
} as const

const addRecordValueKey = (
  input: {
    recordId: RecordId
    fieldId: FieldId
  },
  ctx: Pick<ReducerContext<DataDoc, DocumentOperation, DataviewMutationKey>, 'footprint'>
) => {
  ctx.footprint(key.recordField(input.recordId, input.fieldId))
  ctx.footprint(key.fieldValues(input.fieldId, input.recordId))
}

const addRecordValueKeys = (
  input: {
    recordIds: readonly RecordId[]
    set?: Partial<Record<FieldId, unknown>>
    clear?: readonly FieldId[]
  },
  ctx: Pick<ReducerContext<DataDoc, DocumentOperation, DataviewMutationKey>, 'footprint'>
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

export const serializeDataviewMutationKey = (
  mutationKey: DataviewMutationKey
): string => mutationPath.toString(mutationKey)

export const dataviewMutationKeyConflicts = (
  left: DataviewMutationKey,
  right: DataviewMutationKey
): boolean => mutationPath.overlaps(left, right)

export const collectOperationFootprint = (
  ctx: Pick<ReducerContext<DataDoc, DocumentOperation, DataviewMutationKey>, 'doc' | 'footprint'>,
  operation: DocumentOperation
) => {
  const current = ctx.doc()

  switch (operation.type) {
    case 'document.record.insert':
      ctx.footprint(key.recordsOrder())
      operation.records.forEach((record) => {
        ctx.footprint(key.record(record.id))
        Object.keys(record.values).forEach((fieldId) => {
          addRecordValueKey({
            recordId: record.id,
            fieldId: fieldId as FieldId
          }, ctx)
        })
      })
      return
    case 'document.record.patch':
      ctx.footprint(key.record(operation.recordId))
      return
    case 'document.record.remove':
      ctx.footprint(key.recordsOrder())
      operation.recordIds.forEach((recordId) => {
        ctx.footprint(key.record(recordId))
      })
      return
    case 'document.record.fields.writeMany':
      addRecordValueKeys(operation, ctx)
      return
    case 'document.record.fields.restoreMany':
      operation.entries.forEach((entry) => {
        addRecordValueKeys({
          recordIds: [entry.recordId],
          set: entry.set,
          clear: entry.clear
        }, ctx)
      })
      return
    case 'document.field.put': {
      const existed = Boolean(current.fields.byId[operation.field.id])
      if (!existed) {
        ctx.footprint(key.fieldsOrder())
      }
      ctx.footprint(key.field(operation.field.id))
      return
    }
    case 'document.field.patch':
      ctx.footprint(key.field(operation.id))
      return
    case 'document.field.remove':
      ctx.footprint(key.fieldsOrder())
      ctx.footprint(key.field(operation.id))
      return
    case 'document.view.put': {
      const existed = Boolean(current.views.byId[operation.view.id])
      if (!existed) {
        ctx.footprint(key.viewsOrder())
      }
      ctx.footprint(key.view(operation.view.id))
      return
    }
    case 'document.activeView.set':
      ctx.footprint(key.activeView())
      return
    case 'document.view.remove':
      ctx.footprint(key.viewsOrder())
      ctx.footprint(key.view(operation.id))
      return
    case 'external.version.bump':
      ctx.footprint(key.external(operation.source))
      return
  }
}
