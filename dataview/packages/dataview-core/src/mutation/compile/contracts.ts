import type {
  MutationCompileIssue,
  MutationCompileHandlerInput,
  MutationCompileSource
} from '@shared/mutation/engine/contracts'
import type {
  DataDoc,
  Intent
} from '@dataview/core/types'
import type {
  DataviewMutationPorts
} from '../program'
import type {
  DataviewCompileReader
} from './reader'
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

export type IssueSource = MutationCompileSource<string>

export type ValidationIssue =
  MutationCompileIssue<ValidationCode, string>

export type DataviewCompileContext<
  TIntent extends Intent = Intent,
  TOutput = unknown
> = MutationCompileHandlerInput<
  DataDoc,
  TIntent,
  DataviewMutationPorts,
  TOutput,
  DataviewCompileReader,
  void,
  ValidationCode
>
