import type {
  MutationProgramWriter,
  MutationPorts,
  MutationProgram,
  MutationProgramStep
} from '@shared/mutation'
import {
  createMutationPorts
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
import type {
  DataviewMutationRegistry
} from './targets'
import {
  dataviewMutationRegistry
} from './targets'

export type DataviewProgramStep = MutationProgramStep<string>
export type DataviewProgram = MutationProgram<string>
type DataviewBaseMutationPorts = MutationPorts<
  DataviewMutationRegistry,
  string
>

export type DataviewRecordWriteManyInput = {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export type DataviewMutationPorts = Omit<
  DataviewBaseMutationPorts,
  'record'
> & {
  record: DataviewBaseMutationPorts['record'] & {
    writeValuesMany(input: DataviewRecordWriteManyInput): void
  }
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

export type DataviewFieldId = CustomFieldId

export const createDataviewMutationPorts = (
  writer: MutationProgramWriter<string>
): DataviewMutationPorts => {
  const ports = createMutationPorts(
    dataviewMutationRegistry,
    writer
  )

  return {
    ...ports,
    record: {
      ...ports.record,
      writeValuesMany: (input) => {
        const clearKeys = new Set(input.clear ?? [])
        const setEntries = Object.entries(input.set ?? {})
        const updates = input.recordIds.map((id) => {
          const writes: Record<string, unknown> = {}

          setEntries.forEach(([fieldId, value]) => {
            if (fieldId === 'title') {
              writes.title = value
              return
            }
            writes[`values.${fieldId}`] = value
          })

          clearKeys.forEach((fieldId) => {
            if (fieldId === 'title') {
              writes.title = ''
              return
            }
            writes[`values.${fieldId}`] = undefined
          })

          return {
            id,
            writes
          }
        }).filter((entry) => Object.keys(entry.writes).length > 0)

        if (updates.length === 0) {
          return
        }

        ports.record.patchMany(updates)
      }
    }
  }
}
