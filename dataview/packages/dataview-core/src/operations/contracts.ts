import type {
  MutationCompileIssue,
  MutationCompileSource
} from '@shared/mutation'
import type { IntentType } from '@dataview/core/types/intents'

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
