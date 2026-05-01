import type {
  MutationPorts,
  MutationProgram,
  MutationProgramStep
} from '@shared/mutation'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  FieldOption,
  FilterRule,
  SortRule,
  View,
} from '@dataview/core/types'
import type {
  DataviewMutationRegistry
} from './targets'

export type DataviewProgramStep = MutationProgramStep<string>
export type DataviewProgram = MutationProgram<string>
export type DataviewMutationPorts = MutationPorts<
  DataviewMutationRegistry,
  string
>

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
