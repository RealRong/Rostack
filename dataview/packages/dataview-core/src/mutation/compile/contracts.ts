import type {
  MutationIssue,
} from '@shared/mutation'
import type {
  DataDoc,
  Intent,
} from '@dataview/core/types'
import type {
  DataviewMutationDelta,
  DataviewMutationReader,
  DataviewMutationWriter,
} from '../schema'
import type {
  DataviewQuery
} from '../query'

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

export type ValidationIssue = MutationIssue & {
  code: ValidationCode
}

export interface DataviewCompileContext<
  TIntent extends Intent = Intent
> {
  intent: TIntent
  document: DataDoc
  read: DataviewMutationReader
  write: DataviewMutationWriter
  query: DataviewQuery
  change: DataviewMutationDelta
  issue: ((issue: ValidationIssue & Record<string, unknown>) => void) & {
    add(issue: ValidationIssue): void
    all(): readonly MutationIssue[]
    hasErrors(): boolean
  }
  services: void
}
