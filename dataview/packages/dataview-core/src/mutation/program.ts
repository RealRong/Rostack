import type {
  MutationOrderedAnchor,
  MutationProgram,
  MutationProgramStep,
  MutationProgramWriter,
} from '@shared/mutation'
import {
  createMutationWriter
} from '@shared/mutation'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  FieldId,
  FieldOption,
  FilterRule,
  RecordId,
  SortRule,
  View,
} from '@dataview/core/types'
import {
  dataviewMutationModel,
  type DataviewMutationWriter
} from './model'

export type DataviewProgramStep = MutationProgramStep<string>
export type DataviewProgram = MutationProgram<string>

export type DataviewRecordWriteManyInput = {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export type DataviewDocumentPatch = Partial<Pick<
  DataDoc,
  'schemaVersion' | 'activeViewId' | 'meta'
>>

export type DataviewRecordPatch = Partial<Omit<DataRecord, 'id'>>
export type DataviewFieldPatch =
  | Partial<Omit<CustomField, 'id'>>
  | Readonly<Record<string, unknown>>
export type DataviewViewPatch = Partial<Omit<View, 'id'>>
export type DataviewFieldOptionPatch =
  | Partial<Omit<FieldOption, 'id'>>
  | Readonly<Record<string, unknown>>
export type DataviewFilterRulePatch = Partial<Omit<FilterRule, 'id'>>
export type DataviewSortRulePatch = Partial<Omit<SortRule, 'id'>>

export type DataviewMutationPorts = DataviewMutationWriter & {
  record: DataviewMutationWriter['record'] & {
    writeValuesMany(input: DataviewRecordWriteManyInput): void
  }
  fieldOptions(fieldId: CustomFieldId): {
    insert(value: FieldOption, to?: MutationOrderedAnchor): void
    move(optionId: string, to?: MutationOrderedAnchor): void
    patch(optionId: string, patch: DataviewFieldOptionPatch): void
    delete(optionId: string): void
  }
  viewDisplay(viewId: string): {
    insert(fieldId: FieldId, to?: MutationOrderedAnchor): void
    move(fieldId: FieldId, to?: MutationOrderedAnchor): void
    splice(fieldIds: readonly FieldId[], to?: MutationOrderedAnchor): void
    delete(fieldId: FieldId): void
  }
  viewOrder(viewId: string): {
    insert(recordId: RecordId, to?: MutationOrderedAnchor): void
    move(recordId: RecordId, to?: MutationOrderedAnchor): void
    splice(recordIds: readonly RecordId[], to?: MutationOrderedAnchor): void
    delete(recordId: RecordId): void
  }
}

const END_ANCHOR: MutationOrderedAnchor = {
  kind: 'end'
}

export const createDataviewMutationPorts = (
  writer: MutationProgramWriter<string>
): DataviewMutationPorts => {
  const modelWriter = createMutationWriter(
    dataviewMutationModel,
    writer
  )

  return {
    ...modelWriter,
    record: {
      ...modelWriter.record,
      writeValuesMany: (input) => {
        input.recordIds.forEach((recordId) => {
          Object.entries(input.set ?? {}).forEach(([fieldId, value]) => {
            if (fieldId === 'title') {
              modelWriter.record.patch(recordId, {
                title: value as DataRecord['title']
              })
              return
            }

            modelWriter.record.values(recordId).set(
              fieldId as Exclude<FieldId, 'title'>,
              value
            )
          })

          ;(input.clear ?? []).forEach((fieldId) => {
            if (fieldId === 'title') {
              modelWriter.record.patch(recordId, {
                title: ''
              })
              return
            }

            modelWriter.record.values(recordId).remove(
              fieldId as Exclude<FieldId, 'title'>
            )
          })
        })
      }
    },
    fieldOptions: (fieldId) => ({
      insert: (value, to) => modelWriter.field.options(fieldId).insert(
        value,
        to ?? END_ANCHOR
      ),
      move: (optionId, to) => modelWriter.field.options(fieldId).move(
        optionId,
        to ?? END_ANCHOR
      ),
      patch: (optionId, patch) => modelWriter.field.options(fieldId).patch(optionId, patch),
      delete: (optionId) => modelWriter.field.options(fieldId).delete(optionId)
    }),
    viewDisplay: (viewId) => ({
      insert: (fieldId, to) => modelWriter.view.displayFields(viewId).insert(
        fieldId,
        to ?? END_ANCHOR
      ),
      move: (fieldId, to) => modelWriter.view.displayFields(viewId).move(
        fieldId,
        to ?? END_ANCHOR
      ),
      splice: (fieldIds, to) => modelWriter.view.displayFields(viewId).splice(
        fieldIds,
        to ?? END_ANCHOR
      ),
      delete: (fieldId) => modelWriter.view.displayFields(viewId).delete(fieldId)
    }),
    viewOrder: (viewId) => ({
      insert: (recordId, to) => modelWriter.view.order(viewId).insert(
        recordId,
        to ?? END_ANCHOR
      ),
      move: (recordId, to) => modelWriter.view.order(viewId).move(
        recordId,
        to ?? END_ANCHOR
      ),
      splice: (recordIds, to) => modelWriter.view.order(viewId).splice(
        recordIds,
        to ?? END_ANCHOR
      ),
      delete: (recordId) => modelWriter.view.order(viewId).delete(recordId)
    })
  }
}
