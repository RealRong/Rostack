import { key } from '@shared/spec'
import type {
  MutationCompileIssue,
  MutationCompileSource,
  MutationKeySpec
} from '@shared/mutation'
import type { IntentType } from '@dataview/core/types/intents'
import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'

export type ValidationSeverity =
  | 'error'
  | 'warning'

export type ValidationCode =
  | 'compile.applyFailed'
  | 'batch.emptyCollection'
  | 'record.notFound'
  | 'record.duplicateId'
  | 'record.invalidId'
  | 'record.hierarchyUnsupported'
  | 'record.invalidIndex'
  | 'record.emptyPatch'
  | 'record.invalidPatch'
  | 'record.fields.invalidField'
  | 'record.fields.emptyWrite'
  | 'record.fields.overlap'
  | 'view.notFound'
  | 'view.invalid'
  | 'view.invalidProjection'
  | 'view.invalidOrder'
  | 'field.notFound'
  | 'field.invalid'
  | 'external.invalidSource'

export type IssueSource = MutationCompileSource<IntentType>

export type ValidationIssue =
  MutationCompileIssue<ValidationCode, IntentType>

export type DataviewTargetKey =
  | 'records'
  | `records.${RecordId}`
  | `records.${RecordId}.values.${FieldId}`
  | 'fields'
  | `fields.${FieldId}`
  | `fields.${FieldId}.values.${RecordId}`
  | 'views'
  | `views.${ViewId}`
  | 'activeView'
  | `external.${string}`

export type DataviewMutationKey = DataviewTargetKey

const pathKeyCodec = key.path()

export const dataviewMutationKeyCodec: MutationKeySpec<DataviewMutationKey> = {
  serialize: (value) => value,
  conflicts: (left, right) => pathKeyCodec.conflicts(left, right)
}
